// src/agents/nodes.js
// All 8 LangGraph agent node functions

const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage, SystemMessage, AIMessage } = require('@langchain/core/messages');
const pool          = require('../db/pool');
const scraper       = require('../tools/scraper.tool');
const vectorSearch  = require('../tools/vectorSearch.tool');
require('dotenv').config();

// ── Shared LLM ─────────────────────────────────────────────────────────────────
const llm = new ChatGoogleGenerativeAI({
  model: 'gemini-1.5-flash',
  apiKey: process.env.GEMINI_API_KEY,
  temperature: 0.3,
  maxOutputTokens: 8192,
  streaming: true,
});

// ── SSE helper (agents write directly to the response stream) ──────────────────
function emit(writer, event, data) {
  if (writer && !writer.writableEnded) {
    writer.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

// ── Utility: safe JSON parse from LLM output ───────────────────────────────────
function safeParseJSON(text, fallback = {}) {
  try {
    const clean = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    return JSON.parse(clean);
  } catch {
    return fallback;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENT 1 — Orchestrator
// Reads the latest user message and decides which agent to route to.
// ══════════════════════════════════════════════════════════════════════════════
async function orchestratorNode(state) {
  const last = state.messages[state.messages.length - 1];
  const text = typeof last.content === 'string' ? last.content : '';

  const result = await llm.invoke([
    new SystemMessage(
      `You are a routing agent. Classify the user's message into exactly one intent:
- "analyze_website"  — user wants to analyse a URL or pasted HTML
- "enhance_code"     — user wants code improvements on already-analysed pages
- "heatmap_query"    — user is asking about heatmap / user attention data
- "general_chat"     — design questions, help, follow-ups, anything else

Also extract the site URL if present.

Respond ONLY with JSON: { "intent": "<value>", "site_url": "<url or null>" }`
    ),
    new HumanMessage(text),
  ]);

  const parsed = safeParseJSON(result.content, { intent: 'general_chat', site_url: null });

  const routeMap = {
    analyze_website: 'dom_intake',
    enhance_code:    'code_enhancer',
    heatmap_query:   'heatmap_analyzer',
    general_chat:    'general_chat',
  };

  return {
    intent:    parsed.intent,
    next_node: routeMap[parsed.intent] ?? 'general_chat',
    site_url:  parsed.site_url ?? state.site_url,
    current_stage: 'routing',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENT 2 — DOM Intake
// Scrapes the website with Puppeteer, classifies site type, saves pages to DB.
// ══════════════════════════════════════════════════════════════════════════════
async function domIntakeNode(state) {
  const writer = state._sseWriter;
  const last   = state.messages[state.messages.length - 1];
  const text   = typeof last.content === 'string' ? last.content : '';

  // Pull URL from message if not already in state
  const urlMatch  = text.match(/https?:\/\/[^\s]+/);
  const targetUrl = state.site_url ?? urlMatch?.[0];

  if (!targetUrl) {
    return {
      messages: [new AIMessage(
        'Please provide a website URL. Example:\n`Analyse https://yoursite.com for Fitts\'s Law and Gestalt`'
      )],
      current_stage: 'idle',
    };
  }

  emit(writer, 'stage', { stage: 'scraping', message: `Scraping ${targetUrl}…`, progress: 5 });

  try {
    const pages = await scraper.scrapeWebsite(targetUrl, { maxPages: 5 });

    // Classify site type
    const classResult = await llm.invoke([
      new SystemMessage('Respond ONLY with JSON: { "site_type": "ecommerce|saas|portfolio|restaurant|blog|agency|other" }'),
      new HumanMessage(`URL: ${targetUrl}\nPages: ${Object.keys(pages).join(', ')}\nTitles: ${Object.values(pages).map(p => p.page_title).join(', ')}`),
    ]);
    const { site_type = 'other' } = safeParseJSON(classResult.content, { site_type: 'other' });

    // Persist scraped pages to DB
    if (state.session_id) {
      for (const [pageKey, pageData] of Object.entries(pages)) {
        await pool.query(
          `INSERT INTO scraped_pages
             (session_id, site_url, page_key, page_url, page_type, raw_html, computed_css, dom_summary, screenshot_url, element_count, has_cta)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (session_id, page_key)
           DO UPDATE SET raw_html=$6, dom_summary=$8, screenshot_url=$9`,
          [
            state.session_id, targetUrl, pageKey, pageData.page_url, pageData.page_type,
            pageData.html, pageData.css, pageData.dom_summary,
            pageData.screenshot_url, pageData.element_count, pageData.has_cta,
          ]
        );
      }
    }

    const pageList = Object.keys(pages).map(k => `• \`${k}\` (${pages[k].page_type})`).join('\n');
    emit(writer, 'stage', { stage: 'scraping_done', progress: 20 });

    return {
      site_url:         targetUrl,
      site_type,
      scraped_pages:    pages,
      pages_to_analyze: Object.keys(pages),
      current_stage:    'gathering_prefs',
      messages: [new AIMessage(
        `✅ **Scraped ${Object.keys(pages).length} pages** from \`${targetUrl}\`\n\n` +
        `${pageList}\n\n` +
        `**Site type detected:** ${site_type}\n\n` +
        `Before I analyse, tell me your design goals:\n\n` +
        `1. **Style direction** — e.g. dark modern, clean minimal, bold, corporate, playful\n` +
        `2. **Top priority** — conversions, aesthetics, mobile UX, accessibility, or all\n` +
        `3. **Design laws to apply** — say "all" or pick: Fitts, Hick's, Gestalt, F-Pattern, Visual Hierarchy, Typography\n` +
        `4. **Anything specific** you already know needs fixing`
      )],
    };
  } catch (err) {
    emit(writer, 'error', { message: err.message });
    return {
      current_stage: 'error',
      error: err.message,
      messages: [new AIMessage(
        `❌ Could not scrape that site: \`${err.message}\`\n\nYou can also **paste HTML directly** and I'll analyse it.`
      )],
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENT 3 — Design Preference Collector
// Parses the user's design goals from their reply.
// ══════════════════════════════════════════════════════════════════════════════
async function designPreferenceNode(state) {
  if (state.design_prefs_collected) return { next_node: 'benchmark_rag' };

  const last = state.messages[state.messages.length - 1];
  if (!last || last._getType?.() !== 'human') {
    // Nothing to parse yet — just wait
    return { current_stage: 'gathering_prefs' };
  }

  const text = typeof last.content === 'string' ? last.content : '';

  const result = await llm.invoke([
    new SystemMessage(
      `Extract design preferences. Respond ONLY with JSON:
{
  "style":           "dark-modern|minimal|bold|corporate|playful|luxury|other",
  "priority":        "conversions|aesthetics|mobile-ux|accessibility|all",
  "priorityLaws":    ["fitts","hicks","gestalt","fpattern","hierarchy","typography","contrast"],
  "colorScheme":     "string or null",
  "targetAudience":  "string or null",
  "specificRequests":"string or null"
}`
    ),
    new HumanMessage(text),
  ]);

  const prefs = safeParseJSON(result.content, {
    style: 'modern',
    priority: 'all',
    priorityLaws: ['fitts', 'hicks', 'gestalt'],
  });

  if (state.session_id) {
    await pool.query(
      'UPDATE chat_sessions SET design_prefs=$1, site_type=$2 WHERE id=$3',
      [JSON.stringify(prefs), state.site_type, state.session_id]
    );
  }

  const laws = prefs.priorityLaws?.join(', ') ?? 'all design laws';
  return {
    design_preferences:     prefs,
    design_prefs_collected: true,
    next_node:              'benchmark_rag',
    current_stage:          'fetching_benchmarks',
    messages: [new AIMessage(
      `Got it! Focusing on **${prefs.style}** style with **${prefs.priority}** priority.\n` +
      `Applying: **${laws}**\n\nFetching top benchmark sites and your heatmap data now…`
    )],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENT 4 — Benchmark RAG
// Retrieves top-performing sites in the same category via vector search.
// ══════════════════════════════════════════════════════════════════════════════
async function benchmarkRagNode(state) {
  const writer = state._sseWriter;
  emit(writer, 'stage', { stage: 'fetching_benchmarks', message: 'Finding benchmark sites…', progress: 35 });

  try {
    const benchmarks = await vectorSearch.searchBenchmarks({
      siteType:    state.site_type,
      designStyle: state.design_preferences?.style,
      topK:        5,
    });

    const lines = benchmarks.map((b, i) =>
      `${i + 1}. **${b.name}** (${b.url})\n   ${b.description}\n   Design strengths: ${b.design_notes}`
    );

    const benchmarkContext =
      `TOP ${(state.site_type ?? 'similar').toUpperCase()} SITES TO BENCHMARK AGAINST:\n\n` +
      `${lines.join('\n\n')}\n\n` +
      `Common patterns: ${benchmarks.flatMap(b => b.tags ?? []).join(', ')}`;

    emit(writer, 'stage', { stage: 'benchmarks_ready', progress: 42 });

    return {
      benchmark_sites:   benchmarks,
      benchmark_context: benchmarkContext,
      next_node:         'heatmap_analyzer',
    };
  } catch (err) {
    console.error('Benchmark RAG error:', err.message);
    return {
      benchmark_context: `No benchmark data available. Analysing against general best practices.`,
      next_node:         'heatmap_analyzer',
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENT 5 — Heatmap Analyzer
// Loads heatmap summary data for each page and builds NLP context for injection.
// ══════════════════════════════════════════════════════════════════════════════
async function heatmapAnalyzerNode(state) {
  const writer   = state._sseWriter;
  const pageKeys = Object.keys(state.scraped_pages);
  emit(writer, 'stage', { stage: 'analyzing_heatmaps', message: 'Loading heatmap data…', progress: 50 });

  const heatmapData = {};

  for (const pageKey of pageKeys) {
    const { rows } = await pool.query(
      'SELECT * FROM heatmap_summaries WHERE site_url=$1 AND page_key=$2',
      [state.site_url, pageKey]
    );

    if (rows.length > 0) {
      const h = rows[0];
      heatmapData[pageKey] = {
        raw:           h,
        context:       h.summary_text,
        confidence:    h.confidence_level,
        session_count: h.session_count,
      };
    } else {
      heatmapData[pageKey] = {
        raw:           null,
        context:       `No heatmap data yet for ${pageKey}. Recommendations based on design principles only.`,
        confidence:    'none',
        session_count: 0,
      };
    }
  }

  const lines = Object.entries(heatmapData).map(([pk, h]) =>
    `**${pk}** (${h.confidence} confidence, ${h.session_count} sessions): ${h.context}`
  );

  const heatmapContext = lines.length > 0
    ? `REAL USER ATTENTION DATA:\n\n${lines.join('\n\n')}\n\n` +
      `⚠️ Heatmap guidance: Place high-priority CTAs and key content in hot zones. ` +
      `Balance attention placement with overall aesthetic — do not disrupt visual harmony.`
    : 'No heatmap data available. Using design-law predictions only.';

  emit(writer, 'stage', { stage: 'heatmaps_loaded', progress: 55 });

  return {
    heatmap_data:    heatmapData,
    heatmap_context: heatmapContext,
    next_node:       'page_analyzer',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENT 6 — Per-Page Analyzer
// Scores each page individually, then runs cross-page comparison.
// ══════════════════════════════════════════════════════════════════════════════
async function pageAnalyzerNode(state) {
  const writer     = state._sseWriter;
  const pages      = state.pages_to_analyze ?? [];
  const pageAnalyses = { ...state.page_analyses };

  if (pages.length === 0) {
    return { next_node: 'code_enhancer', current_stage: 'enhancing_code' };
  }

  // ── Analyse each page individually ──────────────────────────────────────────
  for (let i = 0; i < pages.length; i++) {
    const pageKey  = pages[i];
    const pageData = state.scraped_pages[pageKey];
    if (!pageData) continue;

    const progress = 55 + Math.round((i / pages.length) * 25);
    emit(writer, 'stage', {
      stage: 'analyzing_pages',
      message: `Analysing ${pageKey} (${i + 1}/${pages.length})…`,
      progress,
      current_page: pageKey,
    });

    const prompt = buildPageAnalysisPrompt({ pageKey, pageData, state });

    const result = await llm.invoke([
      new SystemMessage(PAGE_ANALYSIS_SYSTEM),
      new HumanMessage(prompt),
    ]);

    const analysis = safeParseJSON(result.content, {
      scores:          {},
      critique:        result.content,
      recommendations: [],
    });

    pageAnalyses[pageKey] = analysis;

    // Save to DB
    if (state.session_id) {
      await pool.query(
        `INSERT INTO design_analyses
           (session_id, page_key,
            score_fitts, score_hicks, score_gestalt, score_fpattern,
            score_hierarchy, score_typography, score_contrast, score_overall,
            critique_text, recommendations, heatmap_insights)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT DO NOTHING`,
        [
          state.session_id, pageKey,
          analysis.scores?.fitts,      analysis.scores?.hicks,
          analysis.scores?.gestalt,    analysis.scores?.fpattern,
          analysis.scores?.hierarchy,  analysis.scores?.typography,
          analysis.scores?.contrast,   analysis.scores?.overall,
          analysis.critique,
          JSON.stringify(analysis.recommendations ?? []),
          state.heatmap_data?.[pageKey]?.context,
        ]
      );
    }
  }

  // ── Cross-page consistency check ─────────────────────────────────────────────
  emit(writer, 'stage', { stage: 'cross_page_check', message: 'Checking cross-page consistency…', progress: 82 });

  const pageSummaries = Object.entries(pageAnalyses)
    .map(([pk, a]) =>
      `**${pk}**: CTA="${a.cta_style ?? '?'}", nav=${a.nav_present ?? '?'}, ` +
      `color="${a.primary_color ?? '?'}", font="${a.font_system ?? '?'}"`
    )
    .join('\n');

  const crossResult = await llm.invoke([
    new SystemMessage(
      'Identify design inconsistencies ACROSS pages. ' +
      'Return ONLY JSON: { "discrepancies": [{ "type": string, "pages": string[], "severity": "high|medium|low", "description": string, "fix": string }] }'
    ),
    new HumanMessage(`Site: ${state.site_url} (${state.site_type})\n\n${pageSummaries}`),
  ]);

  const discrepancies = safeParseJSON(crossResult.content, { discrepancies: [] });

  // Build response summary
  const scoresSummary = Object.entries(pageAnalyses)
    .map(([pk, a]) => `**${pk}** — ${a.scores?.overall ?? '?'}/100`)
    .join(' · ');

  const topRecs = Object.entries(pageAnalyses)
    .flatMap(([pk, a]) =>
      (a.recommendations ?? []).slice(0, 2).map(r => `• **${pk}** — ${r.title} _(${r.impact} impact)_`)
    )
    .slice(0, 6);

  return {
    page_analyses:            pageAnalyses,
    cross_page_discrepancies: discrepancies,
    pages_to_analyze:         [],
    next_node:                'code_enhancer',
    current_stage:            'enhancing_code',
    messages: [new AIMessage(
      `📊 **Design Analysis Complete**\n\n` +
      `**Scores:** ${scoresSummary}\n\n` +
      `**${discrepancies.discrepancies?.length ?? 0} cross-page inconsistencies found**\n\n` +
      `**Top Recommendations:**\n${topRecs.join('\n')}\n\n` +
      `Generating enhanced HTML/CSS for each page…`
    )],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENT 7 — Code Enhancer
// Generates improved HTML/CSS for each page using analysis + heatmap context.
// ══════════════════════════════════════════════════════════════════════════════
async function codeEnhancerNode(state) {
  const writer = state._sseWriter;
  const pages  = Object.keys(state.scraped_pages);
  const enhanced = { ...state.enhanced_pages };

  for (let i = 0; i < pages.length; i++) {
    const pageKey  = pages[i];
    const pageData = state.scraped_pages[pageKey];
    const analysis = state.page_analyses[pageKey];
    if (!pageData || !analysis) continue;

    const progress = 85 + Math.round((i / pages.length) * 12);
    emit(writer, 'stage', {
      stage: 'enhancing_code',
      message: `Enhancing ${pageKey}…`,
      progress,
      current_page: pageKey,
    });

    const prompt = buildEnhancementPrompt({ pageKey, pageData, analysis, state });

    const result = await llm.invoke([
      new SystemMessage(CODE_ENHANCEMENT_SYSTEM),
      new HumanMessage(prompt),
    ]);

    const enhancedPage = safeParseJSON(result.content, {
      html:         result.content,
      css:          '',
      diff_summary: 'Enhancement applied.',
      changes:      [],
    });

    enhanced[pageKey] = enhancedPage;

    // Persist
    if (state.session_id) {
      await pool.query(
        `UPDATE design_analyses
         SET enhanced_html=$1, enhanced_css=$2, diff_summary=$3
         WHERE session_id=$4 AND page_key=$5`,
        [enhancedPage.html, enhancedPage.css, enhancedPage.diff_summary, state.session_id, pageKey]
      );
    }
  }

  const pageList = pages.map(pk => `• **${pk}** — enhanced HTML + CSS ready`).join('\n');
  emit(writer, 'stage', { stage: 'done', progress: 100 });

  return {
    enhanced_pages: enhanced,
    next_node:      'done',
    current_stage:  'done',
    stage_progress: 100,
    messages: [new AIMessage(
      `✨ **Enhancement Complete!**\n\n${pageList}\n\n` +
      `You can now:\n` +
      `• **Download** the enhanced HTML/CSS per page from the Analysis Panel\n` +
      `• **Ask me to refine** anything: _"Make the homepage CTA more prominent"_\n` +
      `• **Compare** before/after with the diff view\n\n` +
      `What would you like to do next?`
    )],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENT 8 — General Chat
// Handles all non-analysis messages with full session context.
// ══════════════════════════════════════════════════════════════════════════════
async function generalChatNode(state) {
  const writer  = state._sseWriter;
  const last    = state.messages[state.messages.length - 1];
  const userMsg = typeof last.content === 'string' ? last.content : '';

  // Build session context summary
  const ctx = [];
  if (state.site_url) ctx.push(`Current site: ${state.site_url} (${state.site_type})`);
  if (Object.keys(state.scraped_pages).length > 0)
    ctx.push(`Scraped pages: ${Object.keys(state.scraped_pages).join(', ')}`);
  if (Object.keys(state.page_analyses).length > 0) {
    const scores = Object.entries(state.page_analyses)
      .map(([pk, a]) => `${pk}: ${a.scores?.overall ?? '?'}/100`)
      .join(', ');
    ctx.push(`Analysis scores: ${scores}`);
  }
  if (state.design_preferences?.style)
    ctx.push(`Design prefs: ${JSON.stringify(state.design_preferences)}`);

  const systemPrompt =
    `You are Aura AI, an expert UI/UX design assistant and frontend developer.\n` +
    `You help website owners improve designs using: Hick's Law, Fitts's Law, Gestalt Principles,\n` +
    `F-Pattern, Visual Hierarchy, Rule of Thirds, and Miller's Law.\n` +
    (ctx.length > 0 ? `\nCURRENT SESSION:\n${ctx.join('\n')}\n` : '') +
    `\nBe conversational, specific, and actionable. Format responses with markdown.`;

  // Stream tokens to SSE
  const stream = await llm.stream([
    new SystemMessage(systemPrompt),
    ...state.messages.slice(-10),
    new HumanMessage(userMsg),
  ]);

  let full = '';
  for await (const chunk of stream) {
    const token = chunk.content ?? '';
    full += token;
    emit(writer, 'token', { token });
  }

  return {
    messages:      [new AIMessage(full)],
    current_stage: 'idle',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Prompt builders
// ══════════════════════════════════════════════════════════════════════════════

function buildPageAnalysisPrompt({ pageKey, pageData, state }) {
  const topLaws = state.design_preferences?.priorityLaws?.join(', ') ?? 'all';
  return `
PAGE: ${pageKey} (${pageData.page_type ?? 'unknown'})
URL: ${pageData.page_url}
SITE TYPE: ${state.site_type}
DESIGN GOALS: style=${state.design_preferences?.style ?? 'any'}, priority=${state.design_preferences?.priority ?? 'all'}, laws=${topLaws}

${state.benchmark_context ? `\n${state.benchmark_context}\n` : ''}
${state.heatmap_data?.[pageKey]?.context
  ? `\nREAL USER HEATMAP DATA:\n${state.heatmap_data[pageKey].context}\n`
  : ''}

DOM SUMMARY:
${pageData.dom_summary ?? pageData.html?.substring(0, 3000) ?? 'No data'}

Return ONLY this JSON:
{
  "scores": { "fitts":0-100, "hicks":0-100, "gestalt":0-100, "fpattern":0-100, "hierarchy":0-100, "typography":0-100, "contrast":0-100, "overall":0-100 },
  "critique": "3-4 sentence expert critique referencing specific evidence from the DOM",
  "cta_style": "description of CTA button style",
  "nav_present": true/false,
  "primary_color": "#hex or description",
  "font_system": "font family description",
  "recommendations": [
    { "title": string, "impact": "high|medium|low", "law": "fitts|hicks|gestalt|fpattern|hierarchy|typography|contrast", "description": string, "fix_hint": string }
  ]
}`;
}

function buildEnhancementPrompt({ pageKey, pageData, analysis, state }) {
  const highImpact   = (analysis.recommendations ?? []).filter(r => r.impact === 'high').slice(0, 5);
  const crossFixes   = (state.cross_page_discrepancies?.discrepancies ?? [])
    .filter(d => d.pages?.includes(pageKey)).slice(0, 3);

  return `
PAGE: ${pageKey}
STYLE: ${state.design_preferences?.style ?? 'modern'}
PRIORITY: ${state.design_preferences?.priority ?? 'all'}

HIGH-IMPACT FIXES:
${highImpact.map((r, i) => `${i+1}. [${r.law}] ${r.description} → ${r.fix_hint}`).join('\n') || 'None'}

CROSS-PAGE CONSISTENCY FIXES:
${crossFixes.map(d => `- ${d.type}: ${d.fix}`).join('\n') || 'None'}

${state.heatmap_data?.[pageKey]?.context
  ? `\nHEATMAP GUIDANCE:\n${state.heatmap_data[pageKey].context}\n`
  : ''}

ORIGINAL HTML (first 4000 chars):
${(pageData.html ?? '').substring(0, 4000)}

ORIGINAL CSS (first 1000 chars):
${(pageData.css ?? '').substring(0, 1000)}

Return ONLY this JSON:
{
  "html": "complete enhanced HTML",
  "css": "only new or changed CSS rules",
  "diff_summary": "bullet list: what changed and why",
  "changes": [{ "element": "CSS selector", "change": "description", "law": "design law applied" }]
}`;
}

// ── System prompts ─────────────────────────────────────────────────────────────

const PAGE_ANALYSIS_SYSTEM =
  `You are a world-class UI/UX design expert and CRO specialist.
Analyse web pages against: Hick's Law, Fitts's Law, Gestalt Principles, F-Pattern, Visual Hierarchy, Rule of Thirds, Miller's Law.
Rules: Score honestly (85+ = genuinely excellent). Base findings on DOM evidence, not generic advice.
When heatmap data is provided, weight your findings accordingly — behavioural data > theory.
Output ONLY valid JSON. No commentary outside the JSON.`;

const CODE_ENHANCEMENT_SYSTEM =
  `You are a senior frontend developer and UI/UX engineer.
Enhance HTML/CSS to apply design-law recommendations while preserving the site's brand identity.
Rules:
1. PRESERVE brand identity, colours, and personality — only improve structure and layout
2. Apply Tailwind CSS utility classes where applicable (assume CDN is available)
3. Respect heatmap data — place CTAs and key content in high-attention zones
4. Fix cross-page inconsistencies (nav, typography, CTA styles)
5. Changes should be surgical — fix the issues, don't rewrite the whole page
6. Output ONLY valid JSON. No commentary outside the JSON.`;

module.exports = {
  orchestratorNode,
  domIntakeNode,
  designPreferenceNode,
  benchmarkRagNode,
  heatmapAnalyzerNode,
  pageAnalyzerNode,
  codeEnhancerNode,
  generalChatNode,
};
