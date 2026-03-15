// src/components/onboarding/OnboardingForm.jsx
// Single-page onboarding form — shown as a full overlay on first visit to /app
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Globe, Loader2, CheckCircle2, BarChart2, Paperclip, X as XIcon } from 'lucide-react'
import { onboardingApi } from '../../api/onboarding.api'
import { useAuthStore } from '../../store/authStore'

const DOMAINS = [
  { value: 'ecommerce',  label: 'E-Commerce' },
  { value: 'saas',       label: 'SaaS / App' },
  { value: 'portfolio',  label: 'Portfolio' },
  { value: 'restaurant', label: 'Restaurant / Food' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'blog',       label: 'Blog / Content' },
  { value: 'agency',     label: 'Agency / Business' },
  { value: 'education',  label: 'Education' },
  { value: 'other',      label: 'Other' },
]

const INTENTS = [
  { value: 'increase_conversions', label: 'Increase conversions & sales' },
  { value: 'improve_ux',           label: 'Improve user experience' },
  { value: 'brand_refresh',        label: 'Brand / visual refresh' },
  { value: 'accessibility',        label: 'Fix accessibility issues' },
  { value: 'mobile_ux',            label: 'Better mobile experience' },
  { value: 'seo_design',           label: 'SEO-friendly structure' },
  { value: 'full_audit',           label: 'Full design audit' },
]

const STYLES = [
  { value: 'professional', label: 'Professional', emoji: '💼' },
  { value: 'minimal',      label: 'Minimal',      emoji: '□' },
  { value: 'modern',       label: 'Modern',       emoji: '⚡' },
  { value: 'playful',      label: 'Playful / Funky', emoji: '🎈' },
  { value: 'premium',      label: 'Premium',      emoji: '💎' },
  { value: 'corporate',    label: 'Corporate',    emoji: '🏢' },
]

export default function OnboardingForm({ onComplete }) {
  const { setOnboardingCompleted } = useAuthStore()
  const [url, setUrl]               = useState('')
  const [domain, setDomain]         = useState('')
  const [intent, setIntent]         = useState('')
  const [stylePreference, setStylePreference] = useState('')
  const [otherInfo, setOtherInfo]   = useState('')
  const [uploadedFiles, setUploadedFiles] = useState([])  // { name, url, size }
  const [uploading, setUploading]   = useState(false)
  const [runHeatmap, setRunHeatmap] = useState(false)
  const [errors, setErrors]         = useState({})
  const [loading, setLoading]       = useState(false)
  const [done, setDone]             = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Pre-fill URL from landing page — only if it looks like a real public website
  useEffect(() => {
    const saved = sessionStorage.getItem('aura_landing_url')
    if (saved) {
      sessionStorage.removeItem('aura_landing_url')
      // Only pre-fill if it's a real public URL (not localhost, meet, internal tools)
      const skip = ['localhost', '127.0.0.1', 'meet.google', '192.168', '10.0.', 'internal']
      const isInternal = skip.some(s => saved.includes(s))
      if (!isInternal) setUrl(saved)
    }
  }, [])

  const validate = () => {
    const e = {}
    if (!url.trim()) e.url = 'Website URL is required'
    else if (!/^https?:\/\/.+/.test(url.trim())) e.url = 'Must start with https:// e.g. https://yoursite.com'
    if (!domain) e.domain = 'Please select a domain type'
    if (!intent) e.intent = 'Please select your main goal'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const v = validate()
    if (Object.keys(v).length) { setErrors(v); return }
    setErrors({}); setSubmitError(''); setLoading(true)
    try {
      const res = await onboardingApi.submit({
        intent, url: url.trim(), domain,
        style_preference: stylePreference,
        other_info: otherInfo,
        document_urls: uploadedFiles.map(f => f.url),
        run_heatmap: runHeatmap,
      })
      const data = res.data.data.onboarding_data
      setOnboardingCompleted(data)
      setDone(true)
      setTimeout(() => onComplete(data), 1500)
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Something went wrong. Please try again.')
    } finally { setLoading(false) }
  }

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('documents', f))
      const res = await onboardingApi.uploadDocuments(fd)
      setUploadedFiles(prev => [...prev, ...res.data.data.files])
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'File upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const removeFile = (url) => setUploadedFiles(prev => prev.filter(f => f.url !== url))

  if (done) return (
    <div className="fixed inset-0 z-50 bg-aura-void flex items-center justify-center">
      <motion.div initial={{ scale:0.9, opacity:0 }} animate={{ scale:1, opacity:1 }} className="text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-green-400" />
        </div>
        <h2 className="font-display font-bold text-xl text-aura-text mb-2">All set!</h2>
        <p className="text-sm text-aura-muted">Opening your workspace…</p>
      </motion.div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 bg-aura-void/90 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity:0, y:20 }}
        animate={{ opacity:1, y:0 }}
        transition={{ duration:0.35, ease:[0.16,1,0.3,1] }}
        className="w-full max-w-lg bg-aura-card border border-aura-border rounded-2xl shadow-elevated my-auto"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-aura-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-aura-accent/15 border border-aura-accent/25 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-aura-accent" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base text-aura-text">Set up your workspace</h2>
              <p className="text-xs text-aura-muted mt-0.5">Tell Aura about your website to get personalised analysis</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="px-6 py-5 flex flex-col gap-5">

            {/* Website URL */}
            <div>
              <label className="block text-xs font-semibold text-aura-muted uppercase tracking-wide mb-1.5">
                Website URL <span className="text-aura-error">*</span>
              </label>
              <div className={`flex items-center gap-2 bg-aura-elevated border rounded-lg px-3 transition-all ${errors.url ? 'border-aura-error' : 'border-aura-border focus-within:border-aura-accent'}`}>
                <Globe className="w-4 h-4 text-aura-faint shrink-0" />
                <input
                  type="url"
                  value={url}
                  onChange={e => { setUrl(e.target.value); setErrors(p => ({ ...p, url: '' })) }}
                  placeholder="https://yourwebsite.com"
                  className="flex-1 bg-transparent py-2.5 text-sm text-aura-text placeholder:text-aura-faint outline-none"
                />
              </div>
              {errors.url && <p className="mt-1 text-xs text-aura-error">{errors.url}</p>}
            </div>

            {/* Domain / Type — native select */}
            <div>
              <label className="block text-xs font-semibold text-aura-muted uppercase tracking-wide mb-1.5">
                Website Type <span className="text-aura-error">*</span>
              </label>
              <select
                value={domain}
                onChange={e => { setDomain(e.target.value); setErrors(p => ({ ...p, domain: '' })) }}
                className={`w-full bg-aura-elevated border rounded-lg px-3.5 py-2.5 text-sm text-aura-text outline-none transition-all appearance-none cursor-pointer ${errors.domain ? 'border-aura-error' : 'border-aura-border focus:border-aura-accent'}`}
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6b80' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
              >
                <option value="">Select website type…</option>
                {DOMAINS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              {errors.domain && <p className="mt-1 text-xs text-aura-error">{errors.domain}</p>}
            </div>

            {/* Intent — native select */}
            <div>
              <label className="block text-xs font-semibold text-aura-muted uppercase tracking-wide mb-1.5">
                Main Goal <span className="text-aura-error">*</span>
              </label>
              <select
                value={intent}
                onChange={e => { setIntent(e.target.value); setErrors(p => ({ ...p, intent: '' })) }}
                className={`w-full bg-aura-elevated border rounded-lg px-3.5 py-2.5 text-sm text-aura-text outline-none transition-all appearance-none cursor-pointer ${errors.intent ? 'border-aura-error' : 'border-aura-border focus:border-aura-accent'}`}
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6b80' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
              >
                <option value="">What do you want to improve?</option>
                {INTENTS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
              {errors.intent && <p className="mt-1 text-xs text-aura-error">{errors.intent}</p>}
            </div>

            {/* Style preference — pill selector */}
            <div>
              <label className="block text-xs font-semibold text-aura-muted uppercase tracking-wide mb-2">
                Desired Style <span className="text-aura-faint font-normal normal-case">(optional)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {STYLES.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStylePreference(prev => prev === s.value ? '' : s.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      stylePreference === s.value
                        ? 'bg-aura-accent/15 border-aura-accent/40 text-aura-accent'
                        : 'bg-aura-elevated border-aura-border text-aura-muted hover:border-aura-accent/30 hover:text-aura-text'
                    }`}
                  >
                    <span>{s.emoji}</span> {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Other info — optional textarea */}
            <div>
              <label className="block text-xs font-semibold text-aura-muted uppercase tracking-wide mb-1.5">
                Anything specific to fix? <span className="text-aura-faint font-normal normal-case">(optional)</span>
              </label>
              <textarea
                value={otherInfo}
                onChange={e => setOtherInfo(e.target.value)}
                placeholder="e.g. My CTA button gets ignored, navigation is confusing on mobile, bounce rate is high on pricing page…"
                rows={3}
                className="w-full bg-aura-elevated border border-aura-border focus:border-aura-accent rounded-lg px-3.5 py-2.5 text-sm text-aura-text placeholder:text-aura-faint outline-none resize-none transition-all"
              />
            </div>

            {/* Document upload */}
            <div>
              <label className="block text-xs font-semibold text-aura-muted uppercase tracking-wide mb-1.5">
                Upload Assets <span className="text-aura-faint font-normal normal-case">(optional — brand guidelines, screenshots, docs)</span>
              </label>
              <label className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-dashed cursor-pointer transition-all ${
                uploading ? 'opacity-50 cursor-wait' : 'border-aura-border hover:border-aura-accent/40 hover:bg-aura-accent/5'
              }`}>
                {uploading
                  ? <Loader2 className="w-4 h-4 text-aura-accent animate-spin" />
                  : <Paperclip className="w-4 h-4 text-aura-faint" />}
                <span className="text-xs text-aura-muted">
                  {uploading ? 'Uploading…' : 'Click to attach files (images, PDF, DOCX — max 5 × 10MB)'}
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.docx,.txt"
                  className="hidden"
                  disabled={uploading}
                  onChange={handleFileUpload}
                />
              </label>
              {uploadedFiles.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {uploadedFiles.map(f => (
                    <li key={f.url} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-aura-elevated border border-aura-border">
                      <Paperclip className="w-3 h-3 text-aura-accent shrink-0" />
                      <span className="text-xs text-aura-text truncate flex-1">{f.name}</span>
                      <span className="text-[10px] text-aura-faint shrink-0">{(f.size / 1024).toFixed(0)}KB</span>
                      <button type="button" onClick={() => removeFile(f.url)}
                        className="text-aura-faint hover:text-aura-error transition-colors shrink-0">
                        <XIcon className="w-3 h-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Heatmap toggle */}
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-aura-elevated border border-aura-border">
              <input
                id="heatmap-toggle"
                type="checkbox"
                checked={runHeatmap}
                onChange={e => setRunHeatmap(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-purple-500 cursor-pointer shrink-0"
              />
              <label htmlFor="heatmap-toggle" className="cursor-pointer">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <BarChart2 className="w-3.5 h-3.5 text-aura-accent" />
                  <span className="text-sm font-medium text-aura-text">Set up initial heatmap</span>
                  <span className="text-xs text-aura-faint">(~20–30s)</span>
                </div>
                <p className="text-xs text-aura-muted leading-relaxed">
                  Aura takes a full-page screenshot of your site and generates an AI-predicted attention heatmap. Saved as your baseline in Heatmap Studio.
                </p>
              </label>
            </div>

            {/* Submit error */}
            {submitError && (
              <div className="px-3 py-2.5 rounded-lg bg-aura-error/10 border border-aura-error/20">
                <p className="text-xs text-aura-error">{submitError}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-aura-border flex items-center justify-between gap-3">
            <p className="text-xs text-aura-faint">You can update these settings anytime.</p>
            <button
              type="submit"
              disabled={loading || uploading}
              className="flex items-center gap-2 bg-aura-accent hover:bg-aura-accent-dim disabled:opacity-40 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-all"
            >
              {uploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Uploading files…</>
              ) : loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />{runHeatmap ? 'Setting up…' : 'Saving…'}</>
              ) : (
                <><Sparkles className="w-4 h-4" />Start Analysing</>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
