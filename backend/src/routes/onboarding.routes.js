// src/routes/onboarding.routes.js
const express = require('express')
const router  = express.Router()
const { supabase } = require('../db/pool')
const { authMiddleware } = require('../middleware/auth.middleware')
const scraper = require('../tools/scraper.tool')
const heatmapTool = require('../tools/heatmap.tool')

// Sanitize user-supplied URL: must be http/https and a real URL
function validateAndSanitizeUrl(raw) {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim().substring(0, 2048) // max URL length
  try {
    const parsed = new URL(trimmed)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    // Block localhost/private IPs (SSRF prevention)
    const host = parsed.hostname.toLowerCase()
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host)) return null
    if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.)/.test(host)) return null
    return parsed.href
  } catch { return null }
}

const ALLOWED_DOMAINS = ['ecommerce','saas','portfolio','restaurant','healthcare','blog','agency','education','other']
const ALLOWED_INTENTS = ['increase_conversions','improve_ux','brand_refresh','accessibility','mobile_ux','seo_design','full_audit']

// ── POST /onboarding/submit ──────────────────────────────────────────────────
router.post('/submit', authMiddleware, async (req, res) => {
  const { intent, url, domain, other_info, run_heatmap } = req.body

  // Input validation + sanitization
  const safeUrl = validateAndSanitizeUrl(url)
  if (!safeUrl) {
    return res.status(400).json({ success: false, error: 'A valid public http/https URL is required' })
  }
  if (!domain || !ALLOWED_DOMAINS.includes(domain)) {
    return res.status(400).json({ success: false, error: `domain must be one of: ${ALLOWED_DOMAINS.join(', ')}` })
  }
  const safeIntent = ALLOWED_INTENTS.includes(intent) ? intent : 'full_audit'
  const safeInfo = typeof other_info === 'string' ? other_info.substring(0, 500) : ''

  const onboardingData = {
    intent: safeIntent,
    url: safeUrl,
    domain,
    other_info: safeInfo,
    submitted_at: new Date().toISOString(),
  }

  try {
    // Save onboarding data — this always succeeds fast
    const { error } = await supabase
      .from('users')
      .update({ onboarding_completed: true, onboarding_data: onboardingData })
      .eq('id', req.user.id)

    if (error) throw new Error(error.message)

    // Respond immediately — heatmap runs in background if requested
    res.json({ success: true, data: { onboarding_data: onboardingData, heatmap: null } })

    // Fire-and-forget heatmap setup (doesn't block the response)
    if (run_heatmap) {
      setImmediate(async () => {
        try {
          const pages = await scraper.scrapeWebsite(safeUrl, { maxPages: 1 })
          const homeKey = Object.keys(pages)[0]
          if (homeKey) {
            const pageData = pages[homeKey]
            await heatmapTool.predictHeatmap(
              safeUrl, homeKey,
              pageData.screenshot_url,
              pageData.dom_summary
            )
            console.log(`✅ Initial heatmap generated for ${safeUrl}`)
          }
        } catch (hmErr) {
          console.warn('⚠️  Initial heatmap failed (non-fatal):', hmErr.message)
        }
      })
    }
  } catch (err) {
    console.error('Onboarding submit error:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

// ── GET /onboarding/status ───────────────────────────────────────────────────
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('onboarding_completed, onboarding_data')
      .eq('id', req.user.id)
      .single()

    if (error) throw new Error(error.message)

    return res.json({
      success: true,
      data: {
        onboarding_completed: user.onboarding_completed ?? false,
        onboarding_data: user.onboarding_data ?? null,
      },
    })
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message })
  }
})

module.exports = router
