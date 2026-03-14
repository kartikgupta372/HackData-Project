// src/routes/recommendation.routes.js
// Personalized recommendation + benchmark comparison card API

const express = require('express');
const router  = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const rec     = require('../tools/recommendation.tool');
const { supabase } = require('../db/pool');
const { searchBenchmarks } = require('../tools/vectorSearch.tool');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
require('dotenv').config();

let _llm = null;
function getLLM() {
  if (!_llm) _llm = new ChatGoogleGenerativeAI({ model: 'gemini-2.5-flash', apiKey: process.env.GEMINI_API_KEY, temperature: 0.3, maxOutputTokens: 4096 });
  return _llm;
}
function safeJSON(text, fb = []) {
  if (!text) return fb;
  // Strip markdown code fences
  let clean = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
  // If response starts with text before the array, strip it
  const arrStart = clean.indexOf('[');
  const arrEnd   = clean.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
    clean = clean.substring(arrStart, arrEnd + 1);
  }
  try { return JSON.parse(clean); } catch(e) {
    console.error('safeJSON parse failed:', e.message, '\nRaw (200):', text.substring(0,200));
    return fb;
  }
}

// ── POST /recommendations/track ───────────────────────────────────────────────
router.post('/track', authMiddleware, async (req, res) => {
  try {
    const { siteUrl, pageKey, actionType, actionData } = req.body;
    await rec.trackInteraction(req.user.id, req.body.sessionId, { siteUrl, pageKey, actionType, actionData });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /recommendations/pages ────────────────────────────────────────────────
router.get('/pages', authMiddleware, async (req, res) => {
  try {
    const { siteType, limit } = req.query;
    const pages = await rec.getRankedPages(req.user.id, siteType ?? null, parseInt(limit ?? 10));
    res.json({ success: true, data: pages });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /recommendations/profile ──────────────────────────────────────────────
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const profile = await rec.getUserProfile(req.user.id);
    res.json({ success: true, data: profile });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /recommendations/top-sites ────────────────────────────────────────────
router.get('/top-sites', authMiddleware, async (req, res) => {
  try {
    const { siteType, limit } = req.query;
    const pages = await rec.getRankedPages(null, siteType ?? null, parseInt(limit ?? 5));
    res.json({ success: true, data: pages });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /recommendations/cards ────────────────────────────────────────────────
// Get all recommendation cards for the user (filtered by status/site)
router.get('/cards', authMiddleware, async (req, res) => {
  try {
    const { status, siteUrl, limit = 50 } = req.query;
    let query = supabase.from('recommendation_cards')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));
    if (status) query = query.eq('status', status);
    if (siteUrl) query = query.eq('site_url', siteUrl);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    res.json({ success: true, data: data ?? [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /recommendations/generate-cards ──────────────────────────────────────
// AI compares user's site analysis with top benchmarks and generates change cards
router.post('/generate-cards', authMiddleware, async (req, res) => {
  const { siteUrl, siteType, sessionId, pageAnalyses } = req.body;
  if (!siteUrl || !siteType) return res.status(400).json({ success: false, error: 'siteUrl and siteType required' });

  try {
    // 1. Get top 5 benchmarks for this site type
    const benchmarks = await searchBenchmarks({ siteType, topK: 5 });

    // 2. Build context for AI
    const benchmarkContext = benchmarks.map((b, i) =>
      `${i+1}. ${b.name} (${b.url})\n   ${b.description}\n   Design strengths: ${b.design_notes}\n   Tags: ${b.tags?.join(', ')}`
    ).join('\n\n');

    const analysisContext = pageAnalyses
      ? Object.entries(pageAnalyses).map(([pk, a]) =>
          `Page "${pk}": scores=${JSON.stringify(a.scores)}\n  critique=${a.critique?.substring(0,200)}\n  top recs=${a.recommendations?.slice(0,3).map(r => r.title).join(', ')}`
        ).join('\n')
      : 'No page analysis data yet — generate cards based on site type best practices.';

    // 3. Call AI to generate change cards
    const result = await getLLM().invoke([
      new SystemMessage(
        `You are a senior UI/UX consultant. Generate specific, actionable design change cards for a website owner.
Each card must reference a specific benchmark site as inspiration and cite a design law.
Be concrete — reference real elements like "hero CTA button", "navigation bar", "pricing section".
Return ONLY a JSON array of cards.`
      ),
      new HumanMessage(
        `Website: ${siteUrl} (${siteType})

BENCHMARK SITES TO COMPARE AGAINST:
${benchmarkContext}

CURRENT SITE ANALYSIS:
${analysisContext}

Generate 6-8 specific change cards the website owner can approve or reject.
Each card = one actionable improvement inspired by one of the benchmarks above.

Return ONLY this JSON array (no markdown):
[
  {
    "title": "Short action title",
    "description": "2-3 sentence explanation of what to change and why",
    "change_type": "layout|color|typography|cta|navigation|spacing|imagery",
    "element_target": "specific element e.g. hero section CTA button",
    "before_snippet": "current state description",
    "after_snippet": "proposed state description",
    "inspired_by": "benchmark site name",
    "inspired_url": "benchmark site url",
    "design_law": "fitts|gestalt|hicks|fpattern|hierarchy|typography|contrast",
    "impact_level": "high|medium|low",
    "page_key": "homepage|about|pricing|etc"
  }
]`
      ),
    ]);

    const cards = safeJSON(result.content, []);
    if (!Array.isArray(cards) || !cards.length) {
      console.error('Card generation raw response:', result.content.substring(0, 500));
      return res.status(500).json({ success: false, error: 'AI failed to generate cards — try again in a moment' });
    }

    // 4. Save cards to DB — omit session_id when null to avoid UUID cast error
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

    const { data: inserted, error } = await supabase
      .from('recommendation_cards')
      .insert(toInsert)
      .select();

    if (error) throw new Error(error.message);
    res.json({ success: true, data: { cards: inserted, benchmarks } });

  } catch (err) {
    console.error('Generate cards error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /recommendations/cards/:cardId/action ────────────────────────────────
// Approve or reject a recommendation card
// On approve: creates a new chat session pre-loaded with the implementation task
router.post('/cards/:cardId/action', authMiddleware, async (req, res) => {
  const { cardId } = req.params;
  const { action } = req.body;
  if (!['approve','reject'].includes(action)) return res.status(400).json({ success: false, error: 'action must be approve or reject' });

  try {
    const { data: card, error: fetchErr } = await supabase
      .from('recommendation_cards').select('*').eq('id', cardId).eq('user_id', req.user.id).single();
    if (fetchErr || !card) return res.status(404).json({ success: false, error: 'Card not found' });

    let agentSessionId = null;
    let agentThreadId  = null;

    if (action === 'approve') {
      const { v4: uuidv4 } = require('uuid');
      const threadId = `aura_impl_${uuidv4()}`;
      const sessionTitle = `Implement: ${card.title.substring(0, 50)}`;
      const task = {
        card_id:        card.id,
        title:          card.title,
        description:    card.description,
        change_type:    card.change_type,
        element_target: card.element_target,
        after_snippet:  card.after_snippet,
        inspired_by:    card.inspired_by,
        design_law:     card.design_law,
      };

      const { data: newSession, error: sessErr } = await supabase
        .from('chat_sessions')
        .insert({
          user_id:      req.user.id,
          thread_id:    threadId,
          title:        sessionTitle,
          status:       'active',
          site_url:     card.site_url,
          site_type:    card.site_type,
          design_prefs: JSON.stringify({ implementation_task: task }),
        })
        .select().single();

      if (sessErr) throw new Error(sessErr.message);
      agentSessionId = newSession.id;
      agentThreadId  = threadId;

      // Auto-save the task as the first user message so chat opens ready
      const firstMsg = `Please implement this design improvement for ${card.site_url}:\n\n**${card.title}**\n\n${card.description}\n\n**Target element:** ${card.element_target}\n**Change:** ${card.after_snippet}\n**Inspired by:** ${card.inspired_by}\n**Design law:** ${card.design_law}\n\nApply this change to the enhanced HTML/CSS.`;
      await supabase.from('chat_messages').insert({
        session_id:   newSession.id,
        thread_id:    threadId,
        role:         'user',
        content:      firstMsg,
        content_type: 'text',
        metadata:     JSON.stringify({ source: 'recommendation_card', card_id: card.id }),
      });

      await rec.trackInteraction(req.user.id, agentSessionId, {
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

    await supabase.from('recommendation_cards')
      .update({ status: action === 'approve' ? 'approved' : 'rejected', decided_at: new Date().toISOString(), agent_session_id: agentSessionId })
      .eq('id', cardId);

    res.json({ success: true, data: { status: action === 'approve' ? 'approved' : 'rejected', agent_session_id: agentSessionId, agent_thread_id: agentThreadId } });
  } catch (err) {
    console.error('Card action error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
