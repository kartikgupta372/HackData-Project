// src/routes/onboarding.routes.js — Fixed: URL validation (SSRF), background heatmap
const express  = require('express');
const path     = require('path');
const router   = express.Router();
const { supabase } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth.middleware');
const scraper      = require('../tools/scraper.tool');
const heatmapTool  = require('../tools/heatmap.tool');
const upload       = require('../middleware/upload.middleware');
const { validatePublicUrl } = require('../utils/validateUrl');

// ── POST /onboarding/submit ───────────────────────────────────────────────────
router.post('/submit', authMiddleware, async (req, res) => {
  const { intent, url, domain, style_preference, other_info, document_urls, run_heatmap } = req.body;
  if (!domain) return res.status(400).json({ success: false, error: 'domain is required' });

  // FIX: validate URL before using it (SSRF protection)
  let cleanUrl = null;
  if (url?.trim()) {
    cleanUrl = validatePublicUrl(url.trim());
    if (!cleanUrl) return res.status(400).json({ success: false, error: 'Invalid or private URL. Please use a public website URL.' });
  }

  const onboardingData = {
    intent, url: cleanUrl, domain,
    style_preference: style_preference ?? null,
    document_urls: Array.isArray(document_urls) ? document_urls : [],
    other_info: other_info?.substring(0, 1000) ?? null,
    submitted_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase.from('users')
      .update({ onboarding_completed: true, onboarding_data: onboardingData })
      .eq('id', req.user.id);
    if (error) throw new Error(error.message);

    // Respond immediately — heatmap runs in background
    res.json({ success: true, data: { onboarding_data: onboardingData, heatmap: 'queued' } });

    if (run_heatmap && cleanUrl) {
      setImmediate(async () => {
        try {
          const pages = await scraper.scrapeWebsite(cleanUrl, { maxPages: 1, fullPage: true });
          const homeKey = Object.keys(pages)[0];
          if (homeKey) {
            await heatmapTool.predictHeatmap(cleanUrl, homeKey, pages[homeKey].screenshot_url, pages[homeKey].dom_summary);
            console.log(`✅ Initial heatmap done for ${cleanUrl}`);
          }
        } catch (e) { console.warn('⚠️  Initial heatmap (bg) failed:', e.message); }
      });
    }
  } catch (err) {
    console.error('Onboarding error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /onboarding/upload-documents ────────────────────────────────────────
// Accepts brand assets, guidelines, screenshots (max 5 files, 10MB each)
// Returns array of accessible URLs to be stored with onboarding_data
router.post('/upload-documents', authMiddleware,
  (req, res, next) => {
    upload.array('documents', 5)(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, error: err.message });
      next();
    });
  },
  async (req, res) => {
    if (!req.files?.length) return res.status(400).json({ success: false, error: 'No files uploaded' });
    const backendUrl = process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;
    const files = req.files.map(f => ({
      name:         f.originalname,
      url:          `${backendUrl}/uploads/onboarding/${f.filename}`,
      size:         f.size,
      mimetype:     f.mimetype,
    }));
    res.json({ success: true, data: { files, count: files.length } });
  }
);

// ── GET /onboarding/status ────────────────────────────────────────────────────
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users').select('onboarding_completed, onboarding_data').eq('id', req.user.id).single();
    if (error) throw new Error(error.message);
    res.json({ success: true, data: { onboarding_completed: user.onboarding_completed ?? false, onboarding_data: user.onboarding_data ?? null } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
