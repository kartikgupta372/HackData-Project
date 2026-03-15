// src/routes/insights.routes.js
// Insight Engine: auto-generates UX insight cards from heatmap + scraped page data
// Insights are stored in DB and forwarded to the chatbot context

const express = require('express');
const router  = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const { supabase }       = require('../db/pool');
const pool               = require('../db/pool');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { validatePublicUrl } = require('../utils/validateUrl');
require('dotenv').config();

let _llm = null;
function getLLM() {
  if (_llm) return _llm;
  if (process.env.GROQ_API_KEY) {
    try {
      const { ChatGroq } = require('@langchain/groq');
      _llm = new ChatGroq({
        apiKey: process.env.GROQ_API_KEY,
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        temperature: 0.3,
        maxTokens: 3000,
      });
      console.log('[Insights] Using Groq (llama-4-scout) as LLM');
      return _llm;
    } catch { /* @langchain/groq not installed */ }
  }
  _llm = new ChatGoogleGenerativeAI({
    model: 'gemini-2.0-flash', apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.3, maxOutputTokens: 3000,
  });
  return _llm;
}
function safeJSON(text, fb = []) {
  if (!text) return fb;
  const s = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const a = s.indexOf('['), b = s.lastIndexOf(']');
  try { return a !== -1 && b > a ? JSON.parse(s.substring(a, b + 1)) : JSON.parse(s); }
  catch { return fb; }
}

const INSIGHT_TYPES = [
  'ignored_cta', 'poor_hierarchy', 'overloaded_content',
  'misaligned_nav', 'low_attention', 'accessibility', 'mobile_ux', 'general',
];

// ── POST /insights/generate ──────────────────────────────────────────────────
// Generate insight cards for a site from heatmap summaries + scraped pages.
// Called automatically after heatmap compute, or manually by user.
router.post('/generate', authMiddleware, async (req, res) => {
  const { siteUrl, sessionId } = req.body;
  if (!siteUrl) return res.status(400).json({ success: false, error: 'siteUrl required' });
  const cleanUrl = validatePublicUrl(siteUrl);
  if (!cleanUrl) return res.status(400).json({ success: false, error: 'Invalid URL' });

  try {
    // Gather heatmap summaries for this site
    const { rows: hmRows } = await pool.query(
      `SELECT page_key, summary_text, above_fold_pct, confidence_level, session_count, hot_zones
         FROM heatmap_summaries WHERE site_url = $1 ORDER BY last_updated DESC LIMIT 10`,
      [cleanUrl]
    );

    // Gather scraped page summaries
    let scrapedContext = '';
    if (sessionId) {
      const { rows: pages } = await pool.query(
        `SELECT page_key, page_type, dom_summary, element_count, has_cta
           FROM scraped_pages WHERE session_id = $1 LIMIT 10`,
        [sessionId]
      );
      scrapedContext = pages.map(p =>
        `Page "${p.page_key}" (${p.page_type}): ${p.element_count} elements, CTA present: ${p.has_cta}.\nContent: ${(p.dom_summary || '').substring(0, 400)}`
      ).join('\n\n');
    }

    const heatmapContext = hmRows.map(h =>
      `Page "${h.page_key}": ${h.summary_text} | Above fold: ${h.above_fold_pct}% | Confidence: ${h.confidence_level}`
    ).join('\n');

    if (!heatmapContext && !scrapedContext) {
      return res.status(422).json({ success: false, error: 'No heatmap or scraped data available. Run a survey first.' });
    }

    const result = await getLLM().invoke([
      new SystemMessage(
        `You are an expert UX researcher analysing website behavioral data. Generate actionable insight cards based on heatmap attention data and page structure.
Each insight must be specific, evidence-based, and reference the exact page and element affected.
Return ONLY a JSON array — no markdown, no preamble.`
      ),
      new HumanMessage(
        `Website: ${cleanUrl}\n\n` +
        (heatmapContext ? `HEATMAP DATA:\n${heatmapContext}\n\n` : '') +
        (scrapedContext ? `PAGE STRUCTURE:\n${scrapedContext}\n\n` : '') +
        `Generate 5-8 insight cards. Each insight = one specific UX finding with a clear recommendation.\n\n` +
        `Return ONLY this JSON array:\n` +
        `[\n` +
        `  {\n` +
        `    "title": "Short insight title",\n` +
        `    "description": "What the data shows and why it matters (2-3 sentences)",\n` +
        `    "insight_type": "${INSIGHT_TYPES.join('|')}",\n` +
        `    "page_key": "which page this applies to",\n` +
        `    "element_target": "specific UI element affected",\n` +
        `    "severity": "critical|high|medium|low",\n` +
        `    "evidence": "specific data point supporting this insight",\n` +
        `    "recommendation": "concrete action to fix this"\n` +
        `  }\n` +
        `]`
      ),
    ]);

    const insights = safeJSON(result.content, []);
    if (!insights.length) {
      return res.status(500).json({ success: false, error: 'AI failed to generate insights — try again' });
    }

    // Save to DB
    const toInsert = insights.map(ins => ({
      user_id:        req.user.id,
      site_url:       cleanUrl,
      page_key:       ins.page_key ?? 'homepage',
      title:          ins.title ?? 'UX Insight',
      description:    ins.description ?? '',
      insight_type:   INSIGHT_TYPES.includes(ins.insight_type) ? ins.insight_type : 'general',
      element_target: ins.element_target ?? '',
      severity:       ['critical','high','medium','low'].includes(ins.severity) ? ins.severity : 'medium',
      evidence:       ins.evidence ?? '',
      recommendation: ins.recommendation ?? '',
      status:         'new',
    }));

    const { data: saved, error: insErr } = await supabase
      .from('insight_cards').insert(toInsert).select();
    if (insErr) throw new Error(insErr.message);

    res.json({ success: true, data: { insights: saved, count: saved.length } });
  } catch (err) {
    console.error('Insights generate error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /insights ────────────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { siteUrl, status, severity } = req.query;
    let q = supabase.from('insight_cards').select('*')
      .eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(50);
    if (siteUrl)   q = q.eq('site_url', siteUrl);
    if (status)    q = q.eq('status', status);
    if (severity)  q = q.eq('severity', severity);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    res.json({ success: true, data: data ?? [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── PATCH /insights/:id/status ───────────────────────────────────────────────
router.patch('/:id/status', authMiddleware, async (req, res) => {
  const { status } = req.body;
  const VALID = ['new', 'reviewed', 'actioned', 'dismissed'];
  if (!VALID.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
  try {
    const { data, error } = await supabase.from('insight_cards')
      .update({ status }).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
    if (error) throw new Error(error.message);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /insights/:id/send-to-chat ─────────────────────────────────────────
// Opens a focused chat session to discuss a specific insight
router.post('/:id/send-to-chat', authMiddleware, async (req, res) => {
  try {
    const { data: insight, error } = await supabase.from('insight_cards')
      .select('*').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (error || !insight) return res.status(404).json({ success: false, error: 'Insight not found' });

    const { v4: uuidv4 } = require('uuid');
    const threadId = `aura_ins_${uuidv4()}`;
    const { data: session, error: sessErr } = await supabase.from('chat_sessions').insert({
      user_id:      req.user.id,
      thread_id:    threadId,
      title:        `Insight: ${insight.title.substring(0, 50)}`,
      status:       'active',
      site_url:     insight.site_url,
      design_prefs: JSON.stringify({ insight_id: insight.id }),
    }).select().single();
    if (sessErr) throw new Error(sessErr.message);

    const msg = `I want to discuss this UX insight for ${insight.site_url}:\n\n**${insight.title}** (${insight.severity} severity)\n\n${insight.description}\n\n**Evidence:** ${insight.evidence}\n**Affected element:** ${insight.element_target}\n**Suggested fix:** ${insight.recommendation}\n\nCan you help me understand this issue in more depth and suggest implementation steps?`;
    await supabase.from('chat_messages').insert({
      session_id: session.id, thread_id: threadId, role: 'user',
      content: msg, content_type: 'text',
      metadata: JSON.stringify({ source: 'insight_card', insight_id: insight.id }),
    });
    await supabase.from('insight_cards').update({ status: 'actioned' }).eq('id', insight.id);

    res.json({ success: true, data: { session, thread_id: threadId } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
