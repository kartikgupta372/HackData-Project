// src/routes/recommendation.routes.js
const express = require('express');
const router  = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const rec     = require('../tools/recommendation.tool');
const { supabase } = require('../db/pool');
const { searchBenchmarks } = require('../tools/vectorSearch.tool');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
require('dotenv').config();
const { validatePublicUrl } = require('../utils/validateUrl');

const _cardCache = new Map();

let _llm = null;
function getLLM() {
  if (_llm) return _llm;
  // Prefer Groq (free 14,400 req/day) over Gemini to avoid quota issues
  if (process.env.GROQ_API_KEY) {
    try {
      const { ChatGroq } = require('@langchain/groq');
      _llm = new ChatGroq({
        apiKey: process.env.GROQ_API_KEY,
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        temperature: 0.3,
        maxTokens: 4096,
      });
      console.log('[Recs] Using Groq (llama-4-scout) as LLM');
      return _llm;
    } catch { /* @langchain/groq not installed, fall through */ }
  }
  _llm = new ChatGoogleGenerativeAI({
    model: 'gemini-2.0-flash',
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.3,
    maxOutputTokens: 4096,
  });
  return _llm;
}

function safeJSON(text, fb = []) {
  if (!text) return fb;
  let clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const a = clean.indexOf('['), b = clean.lastIndexOf(']');
  if (a !== -1 && b > a) clean = clean.substring(a, b + 1);
  try { return JSON.parse(clean); } catch (e) {
    console.error('safeJSON failed:', e.message, '\nRaw:', text.substring(0, 200));
    return fb;
  }
}

const DOMAIN_TO_TYPE = {
  ecommerce:'ecommerce', saas:'saas', portfolio:'portfolio',
  restaurant:'restaurant', blog:'blog', agency:'agency',
  healthcare:'saas', education:'saas', other:'other',
};
const INTENT_LABELS = {
  increase_conversions:'increase conversions and sales',
  improve_ux:'improve user experience',
  brand_refresh:'refresh the brand and visual identity',
  accessibility:'fix accessibility issues',
  mobile_ux:'improve mobile experience',
  seo_design:'improve SEO-friendly structure',
  full_audit:'perform a full design audit',
};


// -- helper: load onboarding data for a user ---------------------------------
async function loadOnboarding(userId) {
  try {
    const { data } = await supabase.from('users').select('onboarding_data').eq('id', userId).single();
    return data?.onboarding_data ?? null;
  } catch { return null; }
}

// GET /recommendations/cards
router.get('/cards', authMiddleware, async (req, res) => {
  try {
    const { status, siteUrl, limit = 50 } = req.query;
    const PRIORITY = { high:1, medium:2, low:3 };
    let q = supabase.from('recommendation_cards').select('*')
      .eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(parseInt(limit));
    if (status) q = q.eq('status', status);
    if (siteUrl) q = q.eq('site_url', siteUrl);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const sorted = (data ?? []).sort((a, b) => (PRIORITY[a.impact_level] ?? 4) - (PRIORITY[b.impact_level] ?? 4));
    res.json({ success: true, data: sorted });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/track', authMiddleware, async (req, res) => {
  try {
    const { siteUrl, pageKey, actionType, actionData } = req.body;
    await rec.trackInteraction(req.user.id, req.body.sessionId, { siteUrl, pageKey, actionType, actionData });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/pages', authMiddleware, async (req, res) => {
  try {
    const pages = await rec.getRankedPages(req.user.id, req.query.siteType ?? null, parseInt(req.query.limit ?? 10));
    res.json({ success: true, data: pages });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/profile', authMiddleware, async (req, res) => {
  try {
    res.json({ success: true, data: await rec.getUserProfile(req.user.id) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/top-sites', authMiddleware, async (req, res) => {
  try {
    const pages = await rec.getRankedPages(null, req.query.siteType ?? null, parseInt(req.query.limit ?? 5));
    res.json({ success: true, data: pages });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});


// POST /recommendations/generate-cards
// Auto-loads onboarding data (domain, url, intent, style) — no need to pass from frontend.
// Compares user's site against top sites in the same domain, generates actionable change cards.
router.post('/generate-cards', authMiddleware, async (req, res) => {
  const { sessionId, pageAnalyses, forceRefresh } = req.body;

  // 1. Load onboarding data — this is the source of truth for site context
  const ob = await loadOnboarding(req.user.id);

  // Frontend may still pass siteUrl/siteType as override — respect that, else fall back to onboarding
  const rawUrl   = req.body.siteUrl || ob?.url;
  const siteUrl  = rawUrl ? validatePublicUrl(rawUrl) : null;
  if (!siteUrl) return res.status(400).json({ success: false, error: 'No website URL found. Complete onboarding first.' });

  const siteType  = req.body.siteType || DOMAIN_TO_TYPE[ob?.domain] || 'saas';
  const intent    = INTENT_LABELS[ob?.intent] || ob?.intent || 'improve design';
  const style     = ob?.style_preference || '';
  const otherInfo = ob?.other_info || '';

  // 2. Cache — 1hr per user+site, skip if forceRefresh
  const cacheKey = `${req.user.id}:${siteUrl}`;
  if (!forceRefresh) {
    const cached = _cardCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < 3_600_000) {
      return res.json({ success: true, data: { cards: cached.cards, benchmarks: cached.benchmarks, cached: true } });
    }
  }

  try {
    // 3. Fetch top benchmark sites for this domain
    const benchmarks = await searchBenchmarks({ siteType, designStyle: style, topK: 6 });
    if (!benchmarks.length) {
      return res.status(422).json({ success: false, error: 'No benchmarks found for this domain. Add sites to the benchmark database.' });
    }

    // 4. Build rich benchmark context
    const benchmarkContext = benchmarks.map((b, i) =>
      `${i + 1}. ${b.name} (${b.url})\n` +
      `   What makes it a top site: ${b.design_notes}\n` +
      `   Design tags: ${(b.tags ?? []).join(', ')}`
    ).join('\n\n');

    // 5. Build user site context
    const userCtx = [
      `Website: ${siteUrl}`,
      `Domain: ${siteType}`,
      `Primary goal: ${intent}`,
      style     ? `Desired visual style: ${style}` : '',
      otherInfo ? `Known issues the owner wants fixed: ${otherInfo}` : '',
    ].filter(Boolean).join('\n');

    const analysisCtx = pageAnalyses
      ? Object.entries(pageAnalyses).map(([pk, a]) =>
          `Page "${pk}" (score ${a.scores?.overall ?? '?'}/100): ${a.critique?.substring(0, 200)}`
        ).join('\n')
      : 'No scraped analysis yet — base cards on domain best practices vs benchmarks.';

    // 6. Generate cards with AI
    const result = await getLLM().invoke([
      new SystemMessage(
        `You are a senior UI/UX consultant doing a formal benchmark comparison for a client website.
Compare the client's site against the top sites in their industry. Generate specific, actionable change cards.
Rules:
- Each card MUST name one specific benchmark site as inspiration
- Each card MUST cite a specific design law (Fitts, Hick, Gestalt, F-Pattern, Hierarchy, Typography, Contrast)
- Be surgical — name exact UI elements: "hero CTA button", "pricing table header", "navbar links"
- Describe the gap between the client site and the benchmark clearly in the description
- before_snippet = what the current site likely has / lacks
- after_snippet = what it should look like, inspired by the benchmark
Return ONLY a valid JSON array. No markdown, no text outside the array.`
      ),
      new HumanMessage(
        `== CLIENT WEBSITE ==\n${userCtx}\n\n` +
        `== TOP ${benchmarks.length} BENCHMARK SITES IN ${siteType.toUpperCase()} DOMAIN ==\n${benchmarkContext}\n\n` +
        `== CURRENT ANALYSIS ==\n${analysisCtx}\n\n` +
        `Generate 6-8 change cards comparing the client site to these benchmarks.\n\n` +
        `[\n  {\n` +
        `    "title": "Short imperative (e.g. Add sticky nav with CTA like Linear)",\n` +
        `    "description": "2-3 sentences: what benchmark does well, what gap exists on client site, why it matters for their goal",\n` +
        `    "change_type": "layout|color|typography|cta|navigation|spacing|imagery",\n` +
        `    "element_target": "exact UI element",\n` +
        `    "before_snippet": "current state on client site",\n` +
        `    "after_snippet": "proposed improved state inspired by benchmark",\n` +
        `    "inspired_by": "benchmark site name",\n` +
        `    "inspired_url": "benchmark site url",\n` +
        `    "design_law": "fitts|gestalt|hicks|fpattern|hierarchy|typography|contrast",\n` +
        `    "impact_level": "high|medium|low",\n` +
        `    "page_key": "homepage|about|pricing|contact|etc"\n` +
        `  }\n]`
      ),
    ]);

    const cards = safeJSON(result.content, []);
    if (!Array.isArray(cards) || !cards.length) {
      console.error('Card gen raw:', result.content.substring(0, 500));
      return res.status(500).json({ success: false, error: 'AI failed to generate cards — try again' });
    }

    // 7. Save to DB
    const toInsert = cards.map(c => {
      const row = {
        user_id:        req.user.id,
        site_url:       siteUrl,
        page_key:       c.page_key ?? 'homepage',
        site_type:      siteType,
        title:          c.title ?? 'Improvement',
        description:    c.description ?? '',
        change_type:    c.change_type ?? 'layout',
        element_target: c.element_target ?? '',
        before_snippet: c.before_snippet ?? '',
        after_snippet:  c.after_snippet ?? '',
        inspired_by:    c.inspired_by ?? '',
        inspired_url:   c.inspired_url ?? '',
        design_law:     c.design_law ?? 'hierarchy',
        impact_level:   c.impact_level ?? 'medium',
        status:         'pending',
      };
      if (sessionId) row.session_id = sessionId;
      return row;
    });

    const { data: inserted, error: insErr } = await supabase.from('recommendation_cards').insert(toInsert).select();
    if (insErr) throw new Error(insErr.message);

    _cardCache.set(cacheKey, { cards: inserted, benchmarks, ts: Date.now() });
    res.json({ success: true, data: { cards: inserted, benchmarks, site_url: siteUrl, site_type: siteType } });

  } catch (err) {
    console.error('Generate cards error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


// POST /recommendations/cards/:cardId/action
// approve -> creates chat session pre-loaded with a rich implementation prompt
// reject  -> marks rejected, tracks interaction
router.post('/cards/:cardId/action', authMiddleware, async (req, res) => {
  const { action } = req.body;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ success: false, error: 'action must be approve or reject' });
  }

  try {
    const { data: card, error: fetchErr } = await supabase
      .from('recommendation_cards').select('*').eq('id', req.params.cardId).eq('user_id', req.user.id).single();
    if (fetchErr || !card) return res.status(404).json({ success: false, error: 'Card not found' });

    let chatSessionId = null;
    let chatThreadId  = null;

    if (action === 'approve') {
      const { v4: uuidv4 } = require('uuid');
      chatThreadId = `aura_impl_${uuidv4()}`;

      // Load onboarding for extra context in the prompt
      const ob = await loadOnboarding(req.user.id);
      const intent = INTENT_LABELS[ob?.intent] || ob?.intent || 'improve design';
      const style  = ob?.style_preference || '';

      // Build a rich implementation prompt that explains the comparison and the exact change needed
      const implPrompt =
        `I have approved a design recommendation for **${card.site_url}** and want you to help me implement it.\n\n` +
        `## Approved Change: ${card.title}\n\n` +
        `**What needs to change:** ${card.element_target} on the ${card.page_key} page\n\n` +
        `**Why this matters:**\n${card.description}\n\n` +
        `**Benchmark inspiration:** This change is inspired by **${card.inspired_by}** (${card.inspired_url})\n` +
        `${card.inspired_by} achieves this by: ${card.after_snippet}\n\n` +
        `**Current state (Before):** ${card.before_snippet}\n` +
        `**Target state (After):** ${card.after_snippet}\n\n` +
        `**Design principle applied:** ${card.design_law.toUpperCase()} — ` +
        `this change applies ${card.design_law} to ${card.description.split('.')[0].toLowerCase()}.\n\n` +
        `**My site context:**\n` +
        `- Site: ${card.site_url} (${card.site_type})\n` +
        `- Goal: ${intent}\n` +
        (style ? `- Visual style preference: ${style}\n` : '') +
        `\nPlease generate the complete HTML/CSS implementation for this change. ` +
        `Preserve my site's existing brand colors and typography. ` +
        `Make the code copy-paste ready and explain what each part does.`;

      const { data: newSession, error: sessErr } = await supabase.from('chat_sessions').insert({
        user_id:      req.user.id,
        thread_id:    chatThreadId,
        title:        `Implement: ${card.title.substring(0, 50)}`,
        status:       'active',
        site_url:     card.site_url,
        site_type:    card.site_type,
        design_prefs: JSON.stringify({
          implementation_task: {
            card_id: card.id, title: card.title, change_type: card.change_type,
            element_target: card.element_target, after_snippet: card.after_snippet,
            inspired_by: card.inspired_by, design_law: card.design_law,
          }
        }),
      }).select().single();
      if (sessErr) throw new Error(sessErr.message);

      chatSessionId = newSession.id;

      // Save the prompt as the first user message so the chat opens ready
      await supabase.from('chat_messages').insert({
        session_id:   chatSessionId,
        thread_id:    chatThreadId,
        role:         'user',
        content:      implPrompt,
        content_type: 'text',
        metadata:     JSON.stringify({ source: 'recommendation_approve', card_id: card.id }),
      });

      await rec.trackInteraction(req.user.id, chatSessionId, {
        siteUrl: card.site_url, pageKey: card.page_key,
        actionType: 'applied_fix',
        actionData: { law: card.design_law, style: card.change_type, title: card.title },
      });
    } else {
      await rec.trackInteraction(req.user.id, null, {
        siteUrl: card.site_url, pageKey: card.page_key,
        actionType: 'dismissed_fix',
        actionData: { law: card.design_law, title: card.title },
      });
    }

    await supabase.from('recommendation_cards').update({
      status:           action === 'approve' ? 'approved' : 'rejected',
      decided_at:       new Date().toISOString(),
      agent_session_id: chatSessionId,
    }).eq('id', card.id);

    res.json({
      success: true,
      data: {
        status:           action === 'approve' ? 'approved' : 'rejected',
        session_id:       chatSessionId,
        thread_id:        chatThreadId,
        agent_session_id: chatSessionId,
        agent_thread_id:  chatThreadId,
      },
    });
  } catch (err) {
    console.error('Card action error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


// POST /recommendations/cards/:cardId/discuss
// Opens a focused chat to understand/debate the recommendation before deciding
router.post('/cards/:cardId/discuss', authMiddleware, async (req, res) => {
  try {
    const { data: card, error } = await supabase
      .from('recommendation_cards').select('*').eq('id', req.params.cardId).eq('user_id', req.user.id).single();
    if (error || !card) return res.status(404).json({ success: false, error: 'Card not found' });

    const { v4: uuidv4 } = require('uuid');
    const threadId = `aura_disc_${uuidv4()}`;

    const { data: session, error: sessErr } = await supabase.from('chat_sessions').insert({
      user_id:      req.user.id,
      thread_id:    threadId,
      title:        `Discuss: ${card.title.substring(0, 50)}`,
      status:       'active',
      site_url:     card.site_url,
      design_prefs: JSON.stringify({
        discussion_card: {
          id: card.id, title: card.title, description: card.description,
          element_target: card.element_target, design_law: card.design_law,
          inspired_by: card.inspired_by, before_snippet: card.before_snippet, after_snippet: card.after_snippet,
        }
      }),
    }).select().single();
    if (sessErr) throw new Error(sessErr.message);

    const discussMsg =
      `I want to discuss this design recommendation for **${card.site_url}** before deciding whether to implement it.\n\n` +
      `## ${card.title}\n\n` +
      `${card.description}\n\n` +
      `**Affected element:** ${card.element_target} (${card.page_key} page)\n` +
      `**Current state:** ${card.before_snippet}\n` +
      `**Proposed change:** ${card.after_snippet}\n` +
      `**Design principle:** ${card.design_law}\n` +
      `**Inspired by:** ${card.inspired_by} (${card.inspired_url})\n\n` +
      `Can you explain the reasoning in more depth, show me how ${card.inspired_by} does this, ` +
      `and help me understand the potential impact on my site before I decide?`;

    await supabase.from('chat_messages').insert({
      session_id: session.id, thread_id: threadId, role: 'user',
      content: discussMsg, content_type: 'text',
      metadata: JSON.stringify({ source: 'recommendation_discuss', card_id: card.id }),
    });

    res.json({ success: true, data: { session, thread_id: threadId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /recommendations/vibe-prompt
// Generates a single copy-paste-ready prompt document from multiple selected cards
router.post('/vibe-prompt', authMiddleware, async (req, res) => {
  const { cardIds, siteUrl } = req.body;
  if (!cardIds?.length) return res.status(400).json({ success: false, error: 'cardIds array required' });

  try {
    const { data: cards, error } = await supabase.from('recommendation_cards')
      .select('*').in('id', cardIds).eq('user_id', req.user.id);
    if (error) throw new Error(error.message);
    if (!cards?.length) return res.status(404).json({ success: false, error: 'No cards found' });

    const ob   = await loadOnboarding(req.user.id);
    const site = siteUrl || cards[0]?.site_url || ob?.url || 'the website';

    const changeList = cards.map((c, i) =>
      `### Change ${i + 1}: ${c.title}\n` +
      `**Target:** ${c.element_target} on ${c.page_key} page\n` +
      `**Before:** ${c.before_snippet}\n` +
      `**After:** ${c.after_snippet}\n` +
      `**Design law:** ${c.design_law} — ${c.description}\n` +
      `**Inspired by:** ${c.inspired_by} (${c.inspired_url})\n` +
      `**Impact:** ${c.impact_level}`
    ).join('\n\n');

    const prompt = await getLLM().invoke([
      new SystemMessage('You are a senior UI/UX engineer writing a detailed implementation prompt for an AI coding assistant. Be specific and technical.'),
      new HumanMessage(
        `Generate a Vibe-Coding implementation prompt for ${cards.length} approved design changes on ${site}.\n\n` +
        `This prompt will be pasted into Cursor, GitHub Copilot, or a similar AI tool connected to the repo.\n\n` +
        `APPROVED CHANGES:\n${changeList}\n\n` +
        `The prompt must:\n` +
        `1. State the overall design goal\n` +
        `2. List each change with exact HTML/CSS/Tailwind instructions\n` +
        `3. Explain which design law each change applies\n` +
        `4. Include before/after for each element\n` +
        `5. End with: preserve brand colors, maintain responsiveness, don't break existing layout\n\n` +
        `Format as a single copy-paste-ready prompt.`
      ),
    ]);

    res.json({ success: true, data: { prompt: prompt.content, card_count: cards.length, site_url: site } });
  } catch (err) {
    console.error('Vibe prompt error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
