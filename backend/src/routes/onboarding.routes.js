const express  = require('express');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');
const router   = express.Router();
const storage      = require('../services/storage');
const { runInBackground } = require('../utils/background');
const { supabase } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth.middleware');
const scraper      = require('../tools/scraper.tool');
const heatmapTool  = require('../tools/heatmap.tool');
const upload       = require('../middleware/upload.middleware');
const { validatePublicUrl } = require('../utils/validateUrl');

router.post('/submit', authMiddleware, async (req, res) => {
  const { intent, url, domain, style_preference, other_info, document_urls, run_heatmap } = req.body ?? {};
  if (!domain || typeof domain !== 'string' || domain.length > 50)
    return res.status(400).json({ success: false, error: 'domain is required' });

  let cleanUrl = null;
  if (url?.trim()) {
    cleanUrl = validatePublicUrl(url.trim());
    if (!cleanUrl) return res.status(400).json({ success: false, error: 'Invalid or private URL. Please use a public website URL.' });
  }

  const onboardingData = {
    intent: typeof intent === 'string' ? intent.substring(0, 50) : null,
    url: cleanUrl,
    domain,
    style_preference: typeof style_preference === 'string' ? style_preference.substring(0, 200) : null,
    document_urls: Array.isArray(document_urls)
      ? document_urls.filter(u => typeof u === 'string' && /^(https?:\/\/|\/uploads\/)/.test(u)).slice(0, 5)
      : [],
    other_info: typeof other_info === 'string' ? other_info.substring(0, 1000) : null,
    submitted_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase.from('users')
      .update({ onboarding_completed: true, onboarding_data: onboardingData })
      .eq('id', req.user.id);
    if (error) throw new Error(error.message);

    res.json({ success: true, data: { onboarding_data: onboardingData, heatmap: 'queued' } });

    if (run_heatmap && cleanUrl) {
      runInBackground('onboarding-heatmap', async () => {
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
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Could not save your answers. Please try again.' });
  }
});

router.post('/upload-documents', authMiddleware,
  (req, res, next) => {
    upload.array('documents', 5)(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, error: err.message });
      next();
    });
  },
  async (req, res) => {
    if (!req.files?.length) return res.status(400).json({ success: false, error: 'No files uploaded' });
    try {
      const files = [];
      for (const f of req.files) {
        const ext = path.extname(f.originalname).toLowerCase();
        const url = await storage.save(f.buffer, `onboarding/${req.user.id}/${uuidv4()}${ext}`, f.mimetype);
        files.push({ name: f.originalname.substring(0, 200), url: storage.publicUrl(url), size: f.size, mimetype: f.mimetype });
      }
      res.json({ success: true, data: { files, count: files.length } });
    } catch (err) {
      console.error('Document upload error:', err.message);
      res.status(500).json({ success: false, error: 'Upload failed. Please try again.' });
    }
  }
);

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
