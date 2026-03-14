// src/routes/heatmap.routes.js
// Heatmap: screenshot capture + shareable survey links + click collection + bundles

const express = require('express');
const router  = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const heatmap = require('../tools/heatmap.tool');
const pool    = require('../db/pool');
const { supabase } = require('../db/pool');
const scraper = require('../tools/scraper.tool');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

let _llm = null;
function getLLM() {
  if (!_llm) _llm = new ChatGoogleGenerativeAI({ model: 'gemini-2.5-flash', apiKey: process.env.GEMINI_API_KEY, temperature: 0 });
  return _llm;
}
function safeJSON(t, fb = {}) {
  try { return JSON.parse(t.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim()); } catch { return fb; }
}

// SSRF-safe URL validator (shared across heatmap routes)
function validatePublicUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const p = new URL(raw.trim().substring(0, 2048));
    if (!['http:', 'https:'].includes(p.protocol)) return null;
    const h = p.hostname.toLowerCase();
    if (['localhost','127.0.0.1','0.0.0.0','::1'].includes(h)) return null;
    if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.)/.test(h)) return null;
    return p.href;
  } catch { return null; }
}

// ── POST /heatmap/screenshot ──────────────────────────────────────────────────
// Take a full-page screenshot of a URL and store it; return path + dimensions
router.post('/screenshot', authMiddleware, async (req, res) => {
  const { url, pageKey = 'homepage' } = req.body;
  const safeUrl = validatePublicUrl(url);
  if (!safeUrl) return res.status(400).json({ success: false, error: 'A valid public http/https URL is required' });
  try {
    // fullPage: true gives the long screenshot needed for heatmap surveys
    const pages = await scraper.scrapeWebsite(safeUrl, { maxPages: 1, fullPage: true });
    const homeKey = Object.keys(pages)[0];
    if (!homeKey) return res.status(500).json({ success: false, error: 'Could not scrape page — the site may block bots, require login, or have slow JS rendering' });
    const page = pages[homeKey];
    res.json({
      success: true,
      data: {
        screenshot_url:  page.screenshot_url,
        page_key:        pageKey || homeKey,
        page_url:        page.page_url,
        page_title:      page.page_title,
        element_count:   page.element_count,
        dom_summary:     page.dom_summary,
      }
    });
  } catch (err) {
    console.error('Screenshot error:', err.message);
    // Return friendly error without crashing
    res.status(500).json({
      success: false,
      error: err.message.includes('timed out')
        ? 'Screenshot timed out — the site may be slow or block automated browsers. Try a simpler URL.'
        : `Screenshot failed: ${err.message}`
    });
  }
});

// ── POST /heatmap/create-survey ───────────────────────────────────────────────
// Create a shareable survey link for a page screenshot
router.post('/create-survey', authMiddleware, async (req, res) => {
  const { siteUrl, pageKey, pageUrl, screenshotUrl, screenshotWidth, screenshotHeight, title, instructions } = req.body;
  if (!siteUrl || !pageKey || !screenshotUrl) {
    return res.status(400).json({ success: false, error: 'siteUrl, pageKey, screenshotUrl required' });
  }
  try {
    const { data, error } = await supabase.from('heatmap_survey_links').insert({
      user_id:           req.user.id,
      site_url:          siteUrl,
      page_key:          pageKey,
      page_url:          pageUrl ?? siteUrl,
      screenshot_url:    screenshotUrl,
      screenshot_width:  screenshotWidth ?? 1280,
      screenshot_height: screenshotHeight ?? 3000,
      title:             title ?? `Heatmap Survey — ${pageKey}`,
      instructions:      instructions ?? 'Click on the areas of this page that catch your attention first. Add up to 5 clicks.',
    }).select().single();
    if (error) throw new Error(error.message);
    const surveyUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/survey/${data.token}`;
    res.json({ success: true, data: { ...data, survey_url: surveyUrl } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /heatmap/survey/:token ────────────────────────────────────────────────
// PUBLIC — get survey data (no auth needed, for respondents)
router.get('/survey/:token', async (req, res) => {
  try {
    const { data, error } = await supabase.from('heatmap_survey_links')
      .select('id,token,site_url,page_key,screenshot_url,screenshot_width,screenshot_height,title,instructions,is_active,expires_at')
      .eq('token', req.params.token)
      .single();
    if (error || !data) return res.status(404).json({ success: false, error: 'Survey not found' });
    if (!data.is_active) return res.status(410).json({ success: false, error: 'Survey is no longer active' });
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'Survey has expired' });
    }
    // Build full screenshot URL
    const screenshotFull = data.screenshot_url?.startsWith('http')
      ? data.screenshot_url
      : `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}${data.screenshot_url}`;
    res.json({ success: true, data: { ...data, screenshot_url: screenshotFull } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /heatmap/survey/:token/submit ────────────────────────────────────────
// PUBLIC — submit click data from a survey respondent
router.post('/survey/:token/submit', async (req, res) => {
  const { clicks, participantId, deviceType } = req.body;
  if (!clicks?.length) return res.status(400).json({ success: false, error: 'clicks array required' });
  try {
    // Verify survey exists and is active
    const { data: survey, error: sErr } = await supabase.from('heatmap_survey_links')
      .select('id,site_url,page_key,is_active').eq('token', req.params.token).single();
    if (sErr || !survey) return res.status(404).json({ success: false, error: 'Survey not found' });
    if (!survey.is_active) return res.status(410).json({ success: false, error: 'Survey closed' });

    const pid = participantId ?? uuidv4();
    const events = clicks.slice(0, 10).map((c, i) => ({
      survey_id:      survey.id,
      participant_id: pid,
      x_pct:          Math.max(0, Math.min(1, c.x_pct ?? c.x ?? 0)),
      y_pct:          Math.max(0, Math.min(1, c.y_pct ?? c.y ?? 0)),
      click_order:    i + 1,
      timestamp_ms:   c.timestamp_ms ?? c.t ?? null,
      device_type:    deviceType ?? 'desktop',
    }));

    const { error: insErr } = await supabase.from('survey_click_events').insert(events);
    if (insErr) throw new Error(insErr.message);

    // Increment response count
    await supabase.from('heatmap_survey_links')
      .update({ response_count: supabase.rpc('increment_response_count', { survey_id: survey.id }) })
      .eq('id', survey.id);
    // Simple increment via raw SQL
    await pool.query('UPDATE heatmap_survey_links SET response_count = response_count + 1 WHERE id = $1', [survey.id]);

    // Auto-compute heatmap when we hit 5, 10, 20 responses
    const { rows: cnt } = await pool.query(
      'SELECT response_count FROM heatmap_survey_links WHERE id = $1', [survey.id]
    );
    const count = cnt[0]?.response_count ?? 0;
    if ([5, 10, 20, 50].includes(count)) {
      computeSurveyHeatmap(survey.id, survey.site_url, survey.page_key)
        .catch(e => console.warn('Auto-compute heatmap:', e.message));
    }

    res.json({ success: true, data: { participant_id: pid, clicks_saved: events.length } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /heatmap/surveys ──────────────────────────────────────────────────────
// List all survey links for the authenticated user
router.get('/surveys', authMiddleware, async (req, res) => {
  try {
    const { siteUrl } = req.query;
    let q = supabase.from('heatmap_survey_links')
      .select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (siteUrl) q = q.eq('site_url', siteUrl);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    // For each survey, attach heatmap summary if exists
    const withHeatmaps = await Promise.all((data ?? []).map(async s => {
      const hm = await heatmap.getHeatmap(s.site_url, s.page_key).catch(() => null);
      return { ...s, heatmap_summary: hm };
    }));
    res.json({ success: true, data: withHeatmaps });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /heatmap/survey/:token/results ────────────────────────────────────────
// Get click heatmap results for a survey (auth required — owner only)
router.get('/survey/:token/results', authMiddleware, async (req, res) => {
  try {
    const { data: survey, error } = await supabase.from('heatmap_survey_links')
      .select('*').eq('token', req.params.token).eq('user_id', req.user.id).single();
    if (error || !survey) return res.status(404).json({ success: false, error: 'Survey not found' });

    const { data: clicks } = await supabase.from('survey_click_events')
      .select('*').eq('survey_id', survey.id).order('created_at', { ascending: false });

    const hm = await heatmap.getHeatmap(survey.site_url, survey.page_key).catch(() => null);
    res.json({ success: true, data: { survey, clicks: clicks ?? [], heatmap_summary: hm } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /heatmap/compute/:token ──────────────────────────────────────────────
// Manually trigger heatmap computation from survey clicks
router.post('/compute/:token', authMiddleware, async (req, res) => {
  try {
    const { data: survey } = await supabase.from('heatmap_survey_links')
      .select('*').eq('token', req.params.token).eq('user_id', req.user.id).single();
    if (!survey) return res.status(404).json({ success: false, error: 'Survey not found' });
    const result = await computeSurveyHeatmap(survey.id, survey.site_url, survey.page_key);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /heatmap/bundle ──────────────────────────────────────────────────────
// Create an analysis bundle from selected pages' heatmap data (for chatbot)
router.post('/bundle', authMiddleware, async (req, res) => {
  const { siteUrl, pageKeys, bundleName } = req.body;
  if (!siteUrl || !pageKeys?.length) return res.status(400).json({ success: false, error: 'siteUrl and pageKeys required' });
  try {
    // Gather all heatmap + survey data for selected pages
    const pageData = await Promise.all(pageKeys.map(async pk => {
      const hm = await heatmap.getHeatmap(siteUrl, pk).catch(() => null);
      const { data: survey } = await supabase.from('heatmap_survey_links')
        .select('token,response_count,screenshot_url').eq('site_url', siteUrl).eq('page_key', pk).eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(1).single().catch(() => ({ data: null }));
      return { page_key: pk, heatmap: hm, survey };
    }));

    // Generate AI summary of the bundle
    const summaryPrompt = pageData.map(p =>
      `Page "${p.page_key}": ${p.heatmap?.summary_text ?? 'No heatmap yet'} | Survey responses: ${p.survey?.response_count ?? 0}`
    ).join('\n');

    let aiSummary = '';
    try {
      const r = await getLLM().invoke([
        new SystemMessage('You are a UX analyst. Summarize the heatmap data insights for a developer in 3-4 bullet points.'),
        new HumanMessage(`Site: ${siteUrl}\n\n${summaryPrompt}\n\nSummarize key attention patterns and what they mean for UX.`),
      ]);
      aiSummary = r.content;
    } catch { aiSummary = 'Bundle ready for analysis.'; }

    const bundleData = { site_url: siteUrl, pages: pageData, generated_at: new Date().toISOString() };

    const { data: bundle, error } = await supabase.from('heatmap_bundles').insert({
      user_id:     req.user.id,
      site_url:    siteUrl,
      bundle_name: bundleName ?? `Bundle — ${new Date().toLocaleDateString()}`,
      page_keys:   pageKeys,
      bundle_data: bundleData,
      ai_summary:  aiSummary,
    }).select().single();
    if (error) throw new Error(error.message);
    res.json({ success: true, data: { bundle, ai_summary: aiSummary } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /heatmap/bundle/:bundleId/send-to-chat ───────────────────────────────
// Create a chat session pre-loaded with bundle heatmap data for AI analysis
router.post('/bundle/:bundleId/send-to-chat', authMiddleware, async (req, res) => {
  try {
    const { data: bundle, error } = await supabase.from('heatmap_bundles')
      .select('*').eq('id', req.params.bundleId).eq('user_id', req.user.id).single();
    if (error || !bundle) return res.status(404).json({ success: false, error: 'Bundle not found' });

    const { v4: uuidv4 } = require('uuid');
    const threadId = `aura_hm_${uuidv4()}`;

    const { data: newSession, error: sessErr } = await supabase.from('chat_sessions').insert({
      user_id:      req.user.id,
      thread_id:    threadId,
      title:        `Heatmap Analysis: ${bundle.bundle_name}`,
      status:       'active',
      site_url:     bundle.site_url,
      design_prefs: JSON.stringify({ heatmap_bundle_id: bundle.id }),
    }).select().single();

    if (sessErr) throw new Error(sessErr.message);

    // Auto-save first message with bundle context
    const pagesSummary = bundle.bundle_data?.pages?.map(p =>
      `• **${p.page_key}**: ${p.heatmap?.summary_text ?? 'No heatmap yet'}`
    ).join('\n') ?? 'Bundle pages attached.';

    const firstMsg = `Please analyse this heatmap bundle for ${bundle.site_url}:\n\n**${bundle.bundle_name}**\n\n${pagesSummary}\n\n**AI Summary:**\n${bundle.ai_summary ?? 'No summary yet.'}\n\nBased on this attention data, what are the key UX insights and what should I prioritise fixing?`;

    await supabase.from('chat_messages').insert({
      session_id:   newSession.id,
      thread_id:    threadId,
      role:         'user',
      content:      firstMsg,
      content_type: 'text',
      metadata:     JSON.stringify({ source: 'heatmap_bundle', bundle_id: bundle.id }),
    });

    res.json({ success: true, data: { session: newSession, thread_id: threadId } });
  } catch (err) {
    console.error('Bundle to chat error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /heatmap/bundles ──────────────────────────────────────────────────────
router.get('/bundles', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.from('heatmap_bundles')
      .select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    res.json({ success: true, data: data ?? [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Existing routes ───────────────────────────────────────────────────────────
router.post('/survey-legacy', async (req, res) => { /* kept for backward compat */
  try {
    const { siteUrl, pageKey, pageUrl, participantId, deviceWidth, deviceHeight, webcamUsed, events } = req.body;
    if (!siteUrl || !pageKey || !events?.length) return res.status(400).json({ success: false, error: 'siteUrl, pageKey, and events are required' });
    const result = await heatmap.saveGazeSession({ siteUrl, pageKey, pageUrl, userId: req.user?.id ?? null, participantId, deviceWidth, deviceHeight, webcamUsed, events });
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/aggregate', authMiddleware, async (req, res) => {
  try {
    const { siteUrl, pageKey } = req.body;
    const result = await heatmap.aggregateHeatmap(siteUrl, pageKey);
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/predict', authMiddleware, async (req, res) => {
  try {
    const { siteUrl, pageKey, screenshotPath, domSummary } = req.body;
    const result = await heatmap.predictHeatmap(siteUrl, pageKey, screenshotPath, domSummary);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/sessions/summary', authMiddleware, async (req, res) => {
  try {
    const { siteUrl } = req.query;
    const { rows } = await pool.query(
      'SELECT page_key,COUNT(*) as sessions,MAX(created_at) as last_session FROM gaze_sessions WHERE site_url=$1 AND completed=true GROUP BY page_key', [siteUrl]
    );
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/:pageKey', authMiddleware, async (req, res) => {
  try {
    const siteUrl = req.query.siteUrl;
    const data = await heatmap.getHeatmap(siteUrl, req.params.pageKey);
    if (!data) return res.status(404).json({ success: false, error: 'No heatmap data yet' });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Helper: compute heatmap grid from survey click events ─────────────────────
async function computeSurveyHeatmap(surveyId, siteUrl, pageKey) {
  const { data: clicks } = await supabase.from('survey_click_events')
    .select('x_pct,y_pct,click_order').eq('survey_id', surveyId);
  if (!clicks?.length) return { hasData: false };

  const COLS = 20, ROWS = 20;
  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  const sigma = 1.5;

  for (const c of clicks) {
    const cx = Math.min(COLS-1, Math.floor(c.x_pct * COLS));
    const cy = Math.min(ROWS-1, Math.floor(c.y_pct * ROWS));
    const weight = c.click_order === 1 ? 4.0 : c.click_order === 2 ? 2.5 : 1.0; // first clicks = higher weight
    for (let r = 0; r < ROWS; r++)
      for (let col = 0; col < COLS; col++)
        grid[r][col] += weight * Math.exp(-((col-cx)**2 + (r-cy)**2) / (2*sigma*sigma));
  }

  let max = 0;
  grid.forEach(row => row.forEach(v => { if (v > max) max = v; }));
  const normalized = max > 0 ? grid.map(row => row.map(v => Math.round((v/max)*100))) : grid;

  const cells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells.push({ r, c, score: normalized[r][c] });
  cells.sort((a,b) => b.score - a.score);
  const hotZones = [], taken = new Set();
  for (const { r, c, score } of cells) {
    if (hotZones.length >= 5 || score < 20) break;
    if (taken.has(r+','+c)) continue;
    for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) taken.add((r+dr)+','+(c+dc));
    hotZones.push({ x: parseFloat((c/COLS).toFixed(3)), y: parseFloat((r/ROWS).toFixed(3)), w: parseFloat((1/COLS).toFixed(3)), h: parseFloat((1/ROWS).toFixed(3)), score, label: r < 7 ? 'above-fold' : r < 14 ? 'mid-fold' : 'below-fold' });
  }

  const { rows: cnt } = await pool.query('SELECT response_count FROM heatmap_survey_links WHERE id=$1', [surveyId]);
  const sessionCount = cnt[0]?.response_count ?? 0;
  const afPct = (() => {
    const fold = Math.floor(ROWS * 0.55); let above = 0, total = 0;
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) { total+=normalized[r][c]; if(r<fold) above+=normalized[r][c]; }
    return total > 0 ? parseFloat(((above/total)*100).toFixed(1)) : 0;
  })();

  const summaryText = `${sessionCount} survey responses. ${afPct}% of attention above fold. Top zones: ${hotZones.slice(0,3).map(z=>z.label+'@'+Math.round(z.x*100)+'%,'+Math.round(z.y*100)+'%').join('; ')}.`;

  await pool.query(
    'INSERT INTO heatmap_summaries (site_url,page_key,grid_data,hot_zones,above_fold_pct,summary_text,confidence_level,session_count,predicted,last_updated) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,NOW()) ON CONFLICT ON CONSTRAINT heatmap_summaries_site_page_unique DO UPDATE SET grid_data=$3,hot_zones=$4,above_fold_pct=$5,summary_text=$6,confidence_level=$7,session_count=$8,predicted=false,last_updated=NOW()',
    [siteUrl, pageKey, JSON.stringify(normalized), JSON.stringify(hotZones), afPct, summaryText, sessionCount>=20?'high':sessionCount>=5?'medium':'low', sessionCount]
  );

  return { hasData: true, sessionCount, hotZones, aboveFold: afPct, summaryText };
}

module.exports = router;
