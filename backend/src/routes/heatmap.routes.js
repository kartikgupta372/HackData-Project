const express = require('express');
const rateLimit = require('express-rate-limit');
const router  = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const heatmap = require('../tools/heatmap.tool');
const pool    = require('../db/pool');
const { supabase } = require('../db/pool');
const scraper = require('../tools/scraper.tool');
const storage = require('../services/storage');
const llm     = require('../services/llm');
const { config } = require('../config/env');
const { v4: uuidv4 } = require('uuid');
const { validatePublicUrl } = require('../utils/validateUrl');

function getLLM() {
  return { invoke: async (messages) => ({ content: await llm.complete(messages, { temperature: 0, maxTokens: 1024 }) }) };
}

// Public survey endpoints are unauthenticated — keep them from being abused.
const surveySubmitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: { success: false, error: 'Too many submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const screenshotLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  message: { success: false, error: 'Too many screenshot requests. Please wait a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(Number(n)) ? Number(n) : 0));

router.post('/screenshot', authMiddleware, screenshotLimiter, async (req, res) => {
  const { url, pageKey = 'homepage' } = req.body;
  const safeUrl = validatePublicUrl(url);
  if (!safeUrl) return res.status(400).json({ success: false, error: 'A valid public http/https URL is required' });
  try {
    const pages = await scraper.scrapeWebsite(safeUrl, { maxPages: 1, fullPage: true });
    const homeKey = Object.keys(pages)[0];
    if (!homeKey) return res.status(500).json({ success: false, error: 'Could not scrape page — the site may block bots, require login, or have slow JS rendering' });
    const page = pages[homeKey];
    res.json({
      success: true,
      data: {
        screenshot_url:     storage.publicUrl(page.screenshot_url),
        page_key:           pageKey || homeKey,
        page_url:           page.page_url,
        page_title:         page.page_title,
        element_count:      page.element_count,
        dom_summary:        page.dom_summary,
        full_page_captured: page.full_page_captured === true,
      }
    });
  } catch (err) {
    console.error('Screenshot error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message.includes('timed out')
        ? 'Screenshot timed out — the site may be slow or block automated browsers. Try a simpler URL.'
        : 'Screenshot failed — the site may block automated browsers. You can still create the survey without a screenshot.'
    });
  }
});

router.post('/create-survey', authMiddleware, async (req, res) => {
  const { siteUrl, pageKey, pageUrl, screenshotUrl, screenshotWidth, screenshotHeight, title, instructions } = req.body;
  if (!siteUrl || !pageKey) {
    return res.status(400).json({ success: false, error: 'siteUrl and pageKey are required' });
  }
  const cleanSite = validatePublicUrl(siteUrl);
  if (!cleanSite) return res.status(400).json({ success: false, error: 'Invalid website URL' });
  const shot = typeof screenshotUrl === 'string' ? screenshotUrl.substring(0, 2048) : null;
  try {
    const { data, error } = await supabase.from('heatmap_survey_links').insert({
      user_id:           req.user.id,
      site_url:          cleanSite,
      page_key:          String(pageKey).substring(0, 500),
      page_url:          (validatePublicUrl(pageUrl) ?? cleanSite),
      screenshot_url:    shot,
      screenshot_width:  parseInt(screenshotWidth, 10) || 1280,
      screenshot_height: parseInt(screenshotHeight, 10) || 3000,
      title:             (typeof title === 'string' && title.trim() ? title.trim() : `Heatmap Survey — ${pageKey}`).substring(0, 500),
      instructions:      (typeof instructions === 'string' && instructions.trim() ? instructions.trim() : 'Click on the areas of this page that catch your attention first. Add up to 10 clicks.').substring(0, 2000),
    }).select().single();
    if (error) throw new Error(error.message);
    const appOrigin = config.frontendUrls[0] || config.backendUrl || '';
    const surveyUrl = `${appOrigin}/survey/${data.token}`;
    res.json({ success: true, data: { ...data, survey_url: surveyUrl } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/survey/:token', async (req, res) => {
  try {
    const { data, error } = await supabase.from('heatmap_survey_links')
      .select('id,token,site_url,page_key,screenshot_url,screenshot_width,screenshot_height,title,instructions,is_active,expires_at')
      .eq('token', req.params.token)
      .maybeSingle();
    if (error || !data) return res.status(404).json({ success: false, error: 'Survey not found' });
    if (!data.is_active) return res.status(410).json({ success: false, error: 'Survey is no longer active' });
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'Survey has expired' });
    }
    const { id: _id, ...publicData } = data;
    res.json({ success: true, data: { ...publicData, screenshot_url: storage.publicUrl(data.screenshot_url) } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/survey/:token/submit', surveySubmitLimiter, async (req, res) => {
  const { clicks, participantId, deviceType } = req.body ?? {};
  if (!Array.isArray(clicks) || !clicks.length) return res.status(400).json({ success: false, error: 'clicks array required' });
  try {
    const { data: survey, error: sErr } = await supabase.from('heatmap_survey_links')
      .select('id,site_url,page_key,is_active,expires_at').eq('token', req.params.token).maybeSingle();
    if (sErr || !survey) return res.status(404).json({ success: false, error: 'Survey not found' });
    if (!survey.is_active) return res.status(410).json({ success: false, error: 'Survey closed' });
    if (survey.expires_at && new Date(survey.expires_at) < new Date()) return res.status(410).json({ success: false, error: 'Survey has expired' });

    const pid = typeof participantId === 'string' && participantId.length <= 64 ? participantId : uuidv4();
    const events = clicks.slice(0, 10).map((c, i) => ({
      survey_id:      survey.id,
      participant_id: pid,
      x_pct:          clamp01(c?.x_pct ?? c?.x),
      y_pct:          clamp01(c?.y_pct ?? c?.y),
      click_order:    i + 1,
      timestamp_ms:   Number.isFinite(Number(c?.timestamp_ms ?? c?.t)) ? Math.min(Math.round(Number(c?.timestamp_ms ?? c?.t)), 2_000_000_000) : null,
      device_type:    deviceType === 'mobile' ? 'mobile' : 'desktop',
    }));

    const { error: insErr } = await supabase.from('survey_click_events').insert(events);
    if (insErr) throw new Error(insErr.message);

    const { rows: cnt } = await pool.query(
      'UPDATE heatmap_survey_links SET response_count = response_count + 1 WHERE id = $1 RETURNING response_count', [survey.id]
    );
    const count = cnt[0]?.response_count ?? 0;
    if ([5, 10, 20, 50].includes(count)) {
      computeSurveyHeatmap(survey.id, survey.site_url, survey.page_key)
        .catch(e => console.warn('Auto-compute heatmap:', e.message));
    }

    res.json({ success: true, data: { participant_id: pid, clicks_saved: events.length } });
  } catch (err) {
    console.error('Survey submit error:', err.message);
    res.status(500).json({ success: false, error: 'Could not save your response. Please try again.' });
  }
});

router.get('/surveys', authMiddleware, async (req, res) => {
  try {
    const { siteUrl, since } = req.query;

    let sinceTs = null;
    if (since === 'today') {
      const istDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      sinceTs = new Date(`${istDateStr}T00:00:00+05:30`).toISOString();
    } else if (since) {
      const d = new Date(since);
      if (!isNaN(d.getTime())) sinceTs = d.toISOString();
    }

    let q = supabase.from('heatmap_survey_links')
      .select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (siteUrl) q = q.eq('site_url', siteUrl);
    if (sinceTs) q = q.gte('created_at', sinceTs);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const istTodayStart = new Date(istNow); istTodayStart.setHours(0, 0, 0, 0);

    const withHeatmaps = await Promise.all((data ?? []).map(async s => {
      const hm = await heatmap.getHeatmap(s.site_url, s.page_key).catch(() => null);
      const hmUpdatedToday = hm?.last_updated
        ? new Date(new Date(hm.last_updated).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })) >= istTodayStart
        : false;
      return { ...s, screenshot_url: storage.publicUrl(s.screenshot_url), heatmap_summary: hm ? { ...hm, updated_today: hmUpdatedToday } : null };
    }));
    res.json({ success: true, data: withHeatmaps });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/survey/:token/results', authMiddleware, async (req, res) => {
  try {
    const { data: survey, error } = await supabase.from('heatmap_survey_links')
      .select('*').eq('token', req.params.token).eq('user_id', req.user.id).single();
    if (error || !survey) return res.status(404).json({ success: false, error: 'Survey not found' });

    const { data: clicks } = await supabase.from('survey_click_events')
      .select('*').eq('survey_id', survey.id).order('created_at', { ascending: false });

    const hm = await heatmap.getHeatmap(survey.site_url, survey.page_key).catch(() => null);
    res.json({ success: true, data: { survey: { ...survey, screenshot_url: storage.publicUrl(survey.screenshot_url) }, clicks: clicks ?? [], heatmap_summary: hm } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/compute/:token', authMiddleware, async (req, res) => {
  try {
    const { data: survey } = await supabase.from('heatmap_survey_links')
      .select('*').eq('token', req.params.token).eq('user_id', req.user.id).single();
    if (!survey) return res.status(404).json({ success: false, error: 'Survey not found' });
    const result = await computeSurveyHeatmap(survey.id, survey.site_url, survey.page_key);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/bundle', authMiddleware, async (req, res) => {
  const { siteUrl, bundleName } = req.body ?? {};
  const pageKeys = Array.isArray(req.body?.pageKeys) ? req.body.pageKeys.filter(k => typeof k === 'string').slice(0, 20) : [];
  if (!siteUrl || !pageKeys.length) return res.status(400).json({ success: false, error: 'siteUrl and pageKeys required' });
  try {
    const pageData = await Promise.all(pageKeys.map(async pk => {
      const hm = await heatmap.getHeatmap(siteUrl, pk).catch(() => null);
      const { data: survey } = await supabase.from('heatmap_survey_links')
        .select('token,response_count,screenshot_url').eq('site_url', siteUrl).eq('page_key', pk).eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      return { page_key: pk, heatmap: hm, survey };
    }));

    const summaryPrompt = pageData.map(p =>
      `Page "${p.page_key}": ${p.heatmap?.summary_text ?? 'No heatmap yet'} | Survey responses: ${p.survey?.response_count ?? 0}`
    ).join('\n');

    let aiSummary = '';
    try {
      const r = await getLLM().invoke([
        { role: 'system', content: 'You are a UX analyst. Summarize the heatmap data insights for a developer in 3-4 bullet points.' },
        { role: 'user', content: `Site: ${siteUrl}\n\n${summaryPrompt}\n\nSummarize key attention patterns and what they mean for UX.` },
      ]);
      aiSummary = r.content;
    } catch { aiSummary = 'Bundle ready for analysis.'; }

    const bundleData = { site_url: siteUrl, pages: pageData, generated_at: new Date().toISOString() };

    const { data: bundle, error } = await supabase.from('heatmap_bundles').insert({
      user_id:     req.user.id,
      site_url:    siteUrl,
      bundle_name: (typeof bundleName === 'string' && bundleName.trim() ? bundleName.trim() : `Bundle — ${new Date().toLocaleDateString('en-IN')}`).substring(0, 500),
      page_keys:   pageKeys,
      bundle_data: bundleData,
      ai_summary:  aiSummary,
    }).select().single();
    if (error) throw new Error(error.message);
    res.json({ success: true, data: { bundle, ai_summary: aiSummary } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

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
      design_prefs: { heatmap_bundle_id: bundle.id },
    }).select().single();

    if (sessErr) throw new Error(sessErr.message);

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
      metadata:     { source: 'heatmap_bundle', bundle_id: bundle.id },
    });

    res.json({ success: true, data: { session: newSession, thread_id: threadId } });
  } catch (err) {
    console.error('Bundle to chat error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/bundles', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.from('heatmap_bundles')
      .select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    res.json({ success: true, data: data ?? [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

 router.post('/survey-legacy', surveySubmitLimiter, async (req, res) => {
  try {
    const { siteUrl, pageKey, pageUrl, participantId, deviceWidth, deviceHeight, webcamUsed, events } = req.body;
    if (!siteUrl || !pageKey || !events?.length) return res.status(400).json({ success: false, error: 'siteUrl, pageKey, and events are required' });
    const cleanSite = validatePublicUrl(siteUrl);
    if (!cleanSite) return res.status(400).json({ success: false, error: 'Invalid siteUrl' });
    const result = await heatmap.saveGazeSession({ siteUrl: cleanSite, pageKey: String(pageKey).substring(0, 500), pageUrl, userId: null, participantId, deviceWidth, deviceHeight, webcamUsed, events });
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/aggregate', authMiddleware, async (req, res) => {
  try {
    const { siteUrl, pageKey } = req.body ?? {};
    if (!siteUrl || !pageKey) return res.status(400).json({ success: false, error: 'siteUrl and pageKey are required' });
    const result = await heatmap.aggregateHeatmap(siteUrl, pageKey);
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/predict', authMiddleware, async (req, res) => {
  try {
    const { siteUrl, pageKey, screenshotPath, domSummary } = req.body ?? {};
    const cleanSite = validatePublicUrl(siteUrl);
    if (!cleanSite || !pageKey) return res.status(400).json({ success: false, error: 'siteUrl and pageKey are required' });
    const result = await heatmap.predictHeatmap(
      cleanSite, String(pageKey).substring(0, 500), screenshotPath,
      typeof domSummary === 'string' ? domSummary.substring(0, 4000) : null
    );
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
    if (!siteUrl) return res.status(400).json({ success: false, error: 'siteUrl query parameter is required' });
    const data = await heatmap.getHeatmap(siteUrl, req.params.pageKey);
    if (!data) return res.status(404).json({ success: false, error: 'No heatmap data yet' });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

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
    const weight = c.click_order === 1 ? 4.0 : c.click_order === 2 ? 2.5 : 1.0;
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
    'INSERT INTO heatmap_summaries (site_url,page_key,grid_data,hot_zones,above_fold_pct,summary_text,confidence_level,session_count,predicted,last_updated) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,NOW()) ON CONFLICT (site_url, page_key) DO UPDATE SET grid_data=$3,hot_zones=$4,above_fold_pct=$5,summary_text=$6,confidence_level=$7,session_count=$8,predicted=false,last_updated=NOW()',
    [siteUrl, pageKey, JSON.stringify(normalized), JSON.stringify(hotZones), afPct, summaryText, sessionCount>=20?'high':sessionCount>=5?'medium':'low', sessionCount]
  );

  return { hasData: true, sessionCount, hotZones, aboveFold: afPct, summaryText };
}

module.exports = router;
