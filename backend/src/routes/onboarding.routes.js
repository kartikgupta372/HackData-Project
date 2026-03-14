// src/routes/onboarding.routes.js
// Handles saving onboarding form data and triggering initial heatmap
const express = require('express');
const router  = express.Router();
const { supabase } = require('../db/pool');
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth.middleware');
const scraper = require('../tools/scraper.tool');
const heatmapTool = require('../tools/heatmap.tool');

// ── POST /onboarding/submit ─────────────────────────────────────────────────
// Save onboarding data + optionally trigger initial heatmap screenshot
router.post('/submit', authMiddleware, async (req, res) => {
  const { intent, url, domain, other_info, run_heatmap } = req.body;
  if (!url || !domain) {
    return res.status(400).json({ success: false, error: 'url and domain are required' });
  }

  const onboardingData = { intent, url, domain, other_info, submitted_at: new Date().toISOString() };

  try {
    // Save to users table
    const { error } = await supabase
      .from('users')
      .update({ onboarding_completed: true, onboarding_data: onboardingData })
      .eq('id', req.user.id);

    if (error) throw new Error(error.message);

    let heatmapResult = null;
    if (run_heatmap) {
      // Take a full-page screenshot and create initial heatmap prediction
      try {
        const pages = await scraper.scrapeWebsite(url, { maxPages: 1 });
        const homeKey = Object.keys(pages)[0];
        if (homeKey) {
          const pageData = pages[homeKey];
          await heatmapTool.predictHeatmap(url, homeKey, pageData.screenshot_url, pageData.dom_summary);
          heatmapResult = { page_key: homeKey, screenshot_url: pageData.screenshot_url, status: 'predicted' };
        }
      } catch (hmErr) {
        console.warn('Initial heatmap failed (non-fatal):', hmErr.message);
        heatmapResult = { status: 'failed', error: hmErr.message };
      }
    }

    return res.json({ success: true, data: { onboarding_data: onboardingData, heatmap: heatmapResult } });
  } catch (err) {
    console.error('Onboarding submit error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /onboarding/status ───────────────────────────────────────────────────
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('onboarding_completed, onboarding_data')
      .eq('id', req.user.id)
      .single();

    if (error) throw new Error(error.message);
    return res.json({ success: true, data: { onboarding_completed: user.onboarding_completed, onboarding_data: user.onboarding_data } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
