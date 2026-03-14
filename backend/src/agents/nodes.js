// src/agents/nodes.js
// All 8 LangGraph agent node functions

// ── dotenv MUST be first — before any process.env access ─────────────────────
require('dotenv').config();

const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage, SystemMessage, AIMessage } = require('@langchain/core/messages');
const pool = require('../db/pool');
const scraper = require('../tools/scraper.tool');
const vectorSearch = require('../tools/vectorSearch.tool');
const heatmapTool = require('../tools/heatmap.tool');
const recTool = require('../tools/recommendation.tool');
const sse = require('../utils/sseRegistry');

// ── Lazy LLM singleton — created on first use, after dotenv has loaded ─────────
let _llm = null;
function getLLM() {
  if (!_llm) {
    _llm = new ChatGoogleGenerativeAI({
      model: 'gemini-2.0-flash',
      apiKey: process.env.GEMINI_API_KEY,
      temperature: 0.3,
      maxOutputTokens: 8192,
      streaming: true,
    });
  }
  return _llm;
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
// Routes the user message to the right agent.
// BUG FIX: also checks state to handle mid-flow re-entries (e.g. preference reply)
// ══════════════════════════════════════════════════════════════════════════════
async function orchestratorNode(state) {
  const last = state.messages[state.messages.length - 1];
  const text = typeof last?.content === 'string' ? last.content : '';

  // ── State-based routing (takes priority over message content) ────────────
  // If pages were scraped but preferences not collected yet → user is replying
  // to the "tell me your design goals" question. Route to design_preference.
  const hasScrapedPages = Object.keys(state.scraped_pages ?? {}).length > 0;
  if (hasScrapedPages && !state.design_prefs_collected) {
    return {
      intent: 'design_preference_reply',
      next_node: 'design_preference',
      current_stage: 'gathering_prefs',
    };
  }

  // ── Message-content routing ───────────────────────────────────────────────
  const result = await getLLM().invoke([
    new SystemMessage(
      `You are a routing agent. Classify the user's message into exactly one intent:
- "analyze_website"  — user wants to analyse a URL or pasted HTML
- "enhance_code"     — user explicitly wants HTML/CSS code changes, fixes, or enhancements applied to analysed pages
- "heatmap_query"    — user is asking about heatmap / user attention data
- "general_chat"     — design questions, insights, explanations, scores, recommendations, help, follow-ups

IMPORTANT: Route to "general_chat" for questions about design issues, what's wrong, why scores are low, etc.
Only route to "enhance_code" when the user explicitly says "apply fixes", "generate code", "enhance", "update the HTML", etc.

Also extract the site URL if present.

Respond ONLY with JSON: { "intent": "<value>", "site_url": "<url or null>" }`
    ),
    new HumanMessage(text),
  ]);

  const parsed = safeParseJSON(result.content, { intent: 'general_chat', site_url: null });

  const routeMap = {
    analyze_website: 'dom_intake',
    enhance_code: 'code_enhancer',
    heatmap_query: 'heatmap_analyzer',
    general_chat: 'general_chat',
  };

  return {
    intent: parsed.intent,
    next_node: routeMap[parsed.intent] ?? 'general_chat',
    site_url: parsed.site_url ?? state.site_url,
    current_stage: 'routing',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENT 2 — DOM Intake
// Scrapes the website, classifies site type, saves pages to DB.
// ══════════════════════════════════════════════════════════════════════════════
async function domIntakeNode(state) {
  const threadId = state.thread_id;
  const last = state.messages[state.messages.length - 1];
  const text = typeof last?.content === 'string' ? last.content : '';

  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  const targetUrl = state.site_url ?? urlMatch?.[0];

  if (!targetUrl) {
    return {
      messages: [new AIMessage(
        'Please provide a website URL. Example:\n`Analyse https://yoursite.com for Fitts\'s Law and Gestalt`'
      )],
      current_stage: 'idle',
    };
  }

  sse.emit(threadId, 'stage', { stage: 'scraping', message: `Scraping ${targetUrl}…`, progress: 5 });

  try {
    const pages = await scraper.scrapeWebsite(targetUrl, { maxPages: 5 });

    const classResult = await getLLM().invoke([
      new SystemMessage('Respond ONLY with JSON: { "site_type": "ecommerce|saas|portfolio|restaurant|blog|agency|other" }'),
      new HumanMessage(`URL: ${targetUrl}\nPages: ${Object.keys(pages).join(', ')}\nTitles: ${Object.values(pages).map(p => p.page_title).join(', ')}`),
    ]);
    const { site_type = 'other' } = safeParseJSON(classResult.content, { site_type: 'other' });

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
    sse.emit(threadId, 'stage', { stage: 'scraping_done', progress: 20 });

    return {
      site_url: targetUrl,
      site_type,
      scraped_pages: pages,
      pages_to_analyze: Object.keys(pages),
      current_stage: 'gathering_prefs',
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
    sse.emit(threadId, 'error', { message: err.message });
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
  if (state.design_prefs_collected) {
    return { next_node: 'benchmark_rag' };
  }

  const last = state.messages[state.messages.length - 1];

  // If last message is not human (e.g. we just ran dom_intake), wait.
  if (!last || last._getType?.() !== 'human') {
    return { current_stage: 'gathering_prefs' };
  }

  const text = typeof last.content === 'string' ? last.content : '';

  const result = await getLLM().invoke([
    new SystemMessage(
      `Extract design preferences. Respond ONLY with JSON:
{
  "style":            "dark-modern|minimal|bold|corporate|playful|luxury|other",
  "priority":         "conversions|aesthetics|mobile-ux|accessibility|all",
  "priorityLaws":     ["fitts","hicks","gestalt","fpattern","hierarchy","typography","contrast"],
  "colorScheme":      "string or null",
  "targetAudience":   "string or null",
  "specificRequests": "string or null"
}`
    ),
    new HumanMessage(text),
  ]);

  const prefs = safeParseJSON(result.content, {
    style: 'modern', priority: 'all',
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
    design_preferences: prefs,
    design_prefs_collected: true,
    next_node: 'benchmark_rag',
    current_stage: 'fetching_benchmarks',
    messages: [new AIMessage(
      `Got it! Focusing on **${prefs.style}** style with **${prefs.priority}** priority.\n` +
      `Applying: **${laws}**\n\nFetching top benchmark sites and your heatmap data now…`
    )],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENT 4 — Benchmark RAG
// ══════════════════════════════════════════════════════════════════════════════
async function benchmarkRagNode(state) {
  const threadId = state.thread_id;
  sse.emit(threadId, 'stage', { stage: 'fetching_benchmarks', message: 'Finding benchmark sites…', progress: 35 });

  try {
    const rawBenchmarks = await vectorSearch.searchBenchmarks({
      siteType: state.site_type,
      designStyle: state.design_preferences?.style,
      topK: 5,
    });

    // Re-rank benchmarks based on user's learned preferences
    const benchmarks = state.user_id
      ? await recTool.rankBenchmarksForUser(state.user_id, rawBenchmarks)
      : rawBenchmarks;

    const lines = benchmarks.map((b, i) =>
      `${i + 1}. **${b.name}** (${b.url})\n   ${b.description}\n   Design strengths: ${b.design_notes}`
    );

    const benchmarkContext =
      `TOP ${(state.site_type ?? 'similar').toUpperCase()} SITES TO BENCHMARK AGAINST:\n\n` +
      `${lines.join('\n\n')}\n\n` +
      `Common patterns: ${benchmarks.flatMap(b => b.tags ?? []).join(', ')}`;

    sse.emit(threadId, 'stage', { stage: 'benchmarks_ready', progress: 42 });

    return {
      benchmark_sites: benchmarks,
      benchmark_context: benchmarkContext,
      next_node: 'heatmap_analyzer',
    };
  } catch (err) {
    console.error('Benchmark RAG error:', err.message);
    return {
      benchmark_context: 'No benchmark data available. Analysing against general best practices.',
      next_node: 'heatmap_analyzer',
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENT 5 — Heatmap Analyzer
// ══════════════════════════════════════════════════════════════════════════════
async function heatmapAnalyzerNode(state) {
  const threadId = state.thread_id;
  const pageKeys = Object.keys(state.scraped_pages ?? {});

  sse.emit(threadId, 'stage', { stage: 'analyzing_heatmaps', message: 'Loading heatmap data…', progress: 50 });

  const heatmapData = {};

  for (const pageKey of pageKeys) {
    const pageData = state.scraped_pages[pageKey];

    // 1. Try to get real aggregated heatmap data
    let existing = await heatmapTool.getHeatmap(state.site_url, pageKey);

    // 2. If none exists, generate AI-predicted heatmap from screenshot
    if (!existing) {
      sse.emit(threadId, 'stage', {
        stage: 'predicting_heatmap',
        message: `Predicting attention zones for ${pageKey}…`,
        progress: 51,
      });
      try {
        await heatmapTool.predictHeatmap(
          state.site_url, pageKey,
          pageData?.screenshot_url, pageData?.dom_summary
        );
        existing = await heatmapTool.getHeatmap(state.site_url, pageKey);
      } catch (err) {
        console.warn('Heatmap prediction error:', err.message);
      }
    }

    if (existing) {
      const isReal = !existing.predicted;
      const hotZoneDesc = (existing.hot_zones ?? [])
        .slice(0, 3)
        .map(z => `${z.label}@(${Math.round(z.x * 100)}%,${Math.round(z.y * 100)}%) score:${z.score}`)
        .join(', ');

      heatmapData[pageKey] = {
        raw: existing,
        context: existing.summary_text ?? 'Heatmap data available.',
        confidence: existing.confidence_level ?? (isReal ? 'low' : 'none'),
        session_count: existing.session_count ?? 0,
        predicted: !isReal,
        hot_zones: existing.hot_zones ?? [],
        above_fold_pct: existing.above_fold_pct ?? null,
        grid: existing.grid_data ?? null,
        hot_zone_desc: hotZoneDesc,
      };
    } else {
      heatmapData[pageKey] = {
        raw: null,
        context: `No heatmap data yet for ${pageKey}. Using design-law predictions only.`,
        confidence: 'none',
        session_count: 0,
        predicted: false,
        hot_zones: [],
      };
    }
  }

  // Build rich context string for the AI chatbot
  const lines = Object.entries(heatmapData).map(([pk, h]) => {
    const dataType = h.session_count > 0 ? `${h.session_count} real sessions` : (h.predicted ? 'AI-predicted' : 'no data');
    const foldInfo = h.above_fold_pct != null ? `, ${h.above_fold_pct}% above-fold attention` : '';
    const hotInfo = h.hot_zone_desc ? `, hot zones: ${h.hot_zone_desc}` : '';
    return `**${pk}** (${dataType}${foldInfo}${hotInfo}): ${h.context}`;
  });

  const heatmapContext = lines.length > 0
    ? `USER ATTENTION DATA (time-weighted — first 3s = 4× priority):\n\n${lines.join('\n\n')}\n\n` +
      `⚠️ Place CTAs/key content in identified hot zones. First-3-second attention = highest conversion potential.`
    : 'No heatmap data available. Using design-law predictions only.';

  sse.emit(threadId, 'stage', { stage: 'heatmaps_loaded', progress: 55 });

  return {
    heatmap_data: heatmapData,
    heatmap_context: heatmapContext,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENT 6 — Per-Page Analyzer
// ══════════════════════════════════════════════════════════════════════════════
async function pageAnalyzerNode(state) {
  const threadId = state.thread_id;
  const pages = state.pages_to_analyze ?? [];
  const pageAnalyses = { ...state.page_analyses };

  if (pages.length === 0) {
    return { next_node: 'code_enhancer', current_stage: 'enhancing_code' };
  }

  for (let i = 0; i < pages.length; i++) {
    const pageKey = pages[i];
    const pageData = state.scraped_pages[pageKey];
    if (!pageData) continue;

    const progress = 55 + Math.round((i / pages.length) * 25);
    sse.emit(threadId, 'stage', {
      stage: 'analyzing_pages',
      message: `Analysing ${pageKey} (${i + 1}/${pages.length})…`,
      progress,
      current_page: pageKey,
    });

    const result = await getLLM().invoke([
      new SystemMessage(PAGE_ANALYSIS_SYSTEM),
      new HumanMessage(buildPageAnalysisPrompt({ pageKey, pageData, state })),
    ]);

    const analysis = safeParseJSON(result.content, { scores: {}, critique: result.content, recommendations: [] });
    pageAnalyses[pageKey] = analysis;

    if (state.session_id) {
      await pool.query(
        `INSERT INTO design_analyses
           (session_id, page_key,
            score_fitts, score_hicks, score_gestalt, score_fpattern,
            score_hierarchy, score_typography, score_contrast, score_overall,
            critique_text, recommendations, heatmap_insights)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (session_id, page_key) DO UPDATE
           SET score_fitts=$3, score_hicks=$4, score_gestalt=$5, score_fpattern=$6,
               score_hierarchy=$7, score_typography=$8, score_contrast=$9, score_overall=$10,
               critique_text=$11, recommendations=$12, heatmap_insights=$13`,
        [
          state.session_id, pageKey,
          analysis.scores?.fitts, analysis.scores?.hicks, analysis.scores?.gestalt, analysis.scores?.fpattern,
          analysis.scores?.hierarchy, analysis.scores?.typography, analysis.scores?.contrast, analysis.scores?.overall,
          analysis.critique, JSON.stringify(analysis.recommendations ?? []),
          state.heatmap_data?.[pageKey]?.context,
        ]
      );
      // Update page ranking with new design scores
      await recTool.updatePageRanking(
        state.site_url, pageKey, state.site_type,
        analysis.scores, state.heatmap_data?.[pageKey]?.raw
      ).catch(err => console.warn('Page ranking update error:', err.message));
    }
  }

  sse.emit(threadId, 'stage', { stage: 'cross_page_check', message: 'Checking cross-page consistency…', progress: 82 });

  const pageSummaries = Object.entries(pageAnalyses)
    .map(([pk, a]) => `**${pk}**: CTA="${a.cta_style ?? '?'}", color="${a.primary_color ?? '?'}", font="${a.font_system ?? '?'}"`)
    .join('\n');

  const crossResult = await getLLM().invoke([
    new SystemMessage('Identify design inconsistencies ACROSS pages. Return ONLY JSON: { "discrepancies": [{ "type": string, "pages": string[], "severity": "high|medium|low", "description": string, "fix": string }] }'),
    new HumanMessage(`Site: ${state.site_url} (${state.site_type})\n\n${pageSummaries}`),
  ]);

  const discrepancies = safeParseJSON(crossResult.content, { discrepancies: [] });

  const scoresSummary = Object.entries(pageAnalyses).map(([pk, a]) => `**${pk}** — ${a.scores?.overall ?? '?'}/100`).join(' · ');
  const topRecs = Object.entries(pageAnalyses)
    .flatMap(([pk, a]) => (a.recommendations ?? []).slice(0, 2).map(r => `• **${pk}** — ${r.title} _(${r.impact} impact)_`))
    .slice(0, 6);

  return {
    page_analyses: pageAnalyses,
    cross_page_discrepancies: discrepancies,
    pages_to_analyze: [],
    next_node: 'code_enhancer',
    current_stage: 'enhancing_code',
    messages: [new AIMessage(
      `📊 **Design Analysis Complete**\n\n**Scores:** ${scoresSummary}\n\n` +
      `**${discrepancies.discrepancies?.length ?? 0} cross-page inconsistencies found**\n\n` +
      `**Top Recommendations:**\n${topRecs.join('\n')}\n\nGenerating enhanced HTML/CSS for each page…`
    )],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENT 7 — Code Enhancer
// ══════════════════════════════════════════════════════════════════════════════
async function codeEnhancerNode(state) {
  const threadId = state.thread_id;
  const pages = Object.keys(state.scraped_pages ?? {});
  const enhanced = { ...state.enhanced_pages };

  for (let i = 0; i < pages.length; i++) {
    const pageKey = pages[i];
    const pageData = state.scraped_pages[pageKey];
    const analysis = state.page_analyses[pageKey];
    if (!pageData || !analysis) continue;

    const progress = 85 + Math.round((i / pages.length) * 12);
    sse.emit(threadId, 'stage', { stage: 'enhancing_code', message: `Enhancing ${pageKey}…`, progress, current_page: pageKey });

    const result = await getLLM().invoke([
      new SystemMessage(CODE_ENHANCEMENT_SYSTEM),
      new HumanMessage(buildEnhancementPrompt({ pageKey, pageData, analysis, state })),
    ]);

    const enhancedPage = safeParseJSON(result.content, { html: result.content, css: '', diff_summary: 'Enhancement applied.', changes: [] });
    enhanced[pageKey] = enhancedPage;

    if (state.session_id) {
      await pool.query(
        `UPDATE design_analyses SET enhanced_html=$1, enhanced_css=$2, diff_summary=$3 WHERE session_id=$4 AND page_key=$5`,
        [enhancedPage.html, enhancedPage.css, enhancedPage.diff_summary, state.session_id, pageKey]
      );
      // Record improvement delta for ranking
      const beforeScore = state.page_analyses?.[pageKey]?.scores?.overall ?? 0;
      const afterScore  = enhancedPage.after_score ?? beforeScore + 15; // estimated +15 if not provided
      await recTool.recordImprovement(state.site_url, pageKey, beforeScore, afterScore)
        .catch(err => console.warn('Improvement delta error:', err.message));
    }
  }

  sse.emit(threadId, 'stage', { stage: 'done', progress: 100 });

  return {
    enhanced_pages: enhanced,
    current_stage: 'done',
    stage_progress: 100,
    messages: [new AIMessage(
      `✨ **Enhancement Complete!**\n\n${pages.map(pk => `• **${pk}** — enhanced HTML + CSS ready`).join('\n')}\n\n` +
      `You can now:\n• **Download** the enhanced HTML/CSS per page from the Analysis Panel\n` +
      `• **Ask me to refine** anything: _"Make the homepage CTA more prominent"_`
    )],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENT 8 — General Chat
// ══════════════════════════════════════════════════════════════════════════════
async function generalChatNode(state) {
  const threadId = state.thread_id;
  const last = state.messages[state.messages.length - 1];
  const userMsg = typeof last?.content === 'string' ? last.content : '';

  const ctx = [];
  if (state.site_url) ctx.push(`Current site: ${state.site_url} (${state.site_type})`);
  if (Object.keys(state.scraped_pages ?? {}).length > 0)
    ctx.push(`Scraped pages: ${Object.keys(state.scraped_pages).join(', ')}`);
  if (Object.keys(state.page_analyses ?? {}).length > 0)
    ctx.push(`Analysis scores: ${Object.entries(state.page_analyses).map(([pk, a]) => `${pk}: ${a.scores?.overall ?? '?'}/100`).join(', ')}`);
  if (state.design_preferences?.style)
    ctx.push(`Design prefs: ${JSON.stringify(state.design_preferences)}`);

  const systemPrompt =
    `You are Aura AI, an expert UI/UX design analyst and CRO consultant.\n` +
    `You help website owners UNDERSTAND their designs deeply — you provide insights, analysis, scores, and explanations.\n` +
    `You use design laws as your framework: Hick's Law, Fitts's Law, Gestalt Principles, F-Pattern, Visual Hierarchy, Rule of Thirds, Miller's Law.\n` +
    `\n⚠️ IMPORTANT ROLE BOUNDARY:\n` +
    `- You are the ANALYSIS & INSIGHTS agent. You explain what is wrong, why it matters, and what impact it has.\n` +
    `- You do NOT write or generate HTML/CSS/code changes. When the user asks for code fixes, tell them to use the "Enhance" action in the sidebar — the design enhancement agents will handle that.\n` +
    `- You CAN show short pseudocode or CSS property suggestions (e.g. "increase padding to 16px") but never full file rewrites.\n` +
    (ctx.length > 0 ? `\nCURRENT SESSION CONTEXT:\n${ctx.join('\n')}\n` : '') +
    `\nBe conversational, specific, and evidence-based. Reference real DOM elements. Format responses with markdown.`;

  const stream = await getLLM().stream([
    new SystemMessage(systemPrompt),
    ...state.messages.slice(-10),
    new HumanMessage(userMsg),
  ]);

  let full = '';
  for await (const chunk of stream) {
    const token = chunk.content ?? '';
    full += token;
    sse.emit(threadId, 'token', { token });
  }

  return {
    messages: [new AIMessage(full)],
    current_stage: 'idle',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Prompt builders
// ══════════════════════════════════════════════════════════════════════════════

function buildPageAnalysisPrompt({ pageKey, pageData, state }) {
  return `
PAGE: ${pageKey} (${pageData.page_type ?? 'unknown'})
URL: ${pageData.page_url}
SITE TYPE: ${state.site_type}
DESIGN GOALS: style=${state.design_preferences?.style ?? 'any'}, priority=${state.design_preferences?.priority ?? 'all'}, laws=${state.design_preferences?.priorityLaws?.join(', ') ?? 'all'}

${state.benchmark_context ? `\n${state.benchmark_context}\n` : ''}
${state.heatmap_data?.[pageKey]?.context ? `\nREAL USER HEATMAP DATA:\n${state.heatmap_data[pageKey].context}\n` : ''}

DOM SUMMARY:
${pageData.dom_summary ?? pageData.html?.substring(0, 3000) ?? 'No data'}

Return ONLY this JSON:
{
  "scores": { "fitts":0-100, "hicks":0-100, "gestalt":0-100, "fpattern":0-100, "hierarchy":0-100, "typography":0-100, "contrast":0-100, "overall":0-100 },
  "critique": "3-4 sentence expert critique referencing specific DOM evidence",
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
  const highImpact = (analysis.recommendations ?? []).filter(r => r.impact === 'high').slice(0, 5);
  const crossFixes = (state.cross_page_discrepancies?.discrepancies ?? []).filter(d => d.pages?.includes(pageKey)).slice(0, 3);

  return `
PAGE: ${pageKey}
STYLE: ${state.design_preferences?.style ?? 'modern'}, PRIORITY: ${state.design_preferences?.priority ?? 'all'}

HIGH-IMPACT FIXES:
${highImpact.map((r, i) => `${i + 1}. [${r.law}] ${r.description} → ${r.fix_hint}`).join('\n') || 'None'}

CROSS-PAGE CONSISTENCY FIXES:
${crossFixes.map(d => `- ${d.type}: ${d.fix}`).join('\n') || 'None'}

${state.heatmap_data?.[pageKey]?.context ? `\nHEATMAP GUIDANCE:\n${state.heatmap_data[pageKey].context}\n` : ''}

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

const PAGE_ANALYSIS_SYSTEM =
  `You are a world-class UI/UX design expert and CRO specialist.
Analyse web pages against: Hick's Law, Fitts's Law, Gestalt Principles, F-Pattern, Visual Hierarchy, Rule of Thirds, Miller's Law.
Score honestly (85+ = genuinely excellent). Base findings on DOM evidence.
When heatmap data is provided, weight findings accordingly — behavioural data > theory.
Output ONLY valid JSON. No commentary outside the JSON.`;

const CODE_ENHANCEMENT_SYSTEM =
  `You are a senior frontend developer and UI/UX engineer.
Enhance HTML/CSS to apply design-law recommendations while preserving the site's brand identity.
Rules: PRESERVE brand/colours/personality. Apply Tailwind where applicable (CDN available).
Respect heatmap data for CTA placement. Fix cross-page inconsistencies. Be surgical.
Output ONLY valid JSON. No commentary outside the JSON.`;

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
