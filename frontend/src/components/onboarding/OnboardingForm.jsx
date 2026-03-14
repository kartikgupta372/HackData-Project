import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Globe, ChevronRight, Loader2, BarChart2, CheckCircle2, X } from 'lucide-react'
import { onboardingApi } from '../../api/onboarding.api'
import { useAuthStore } from '../../store/authStore'

const DOMAINS = [
  { value: 'ecommerce',  label: '🛒 E-Commerce',     desc: 'Online store, product listings, cart' },
  { value: 'saas',       label: '⚡ SaaS / App',      desc: 'Software product, dashboard, pricing' },
  { value: 'portfolio',  label: '🎨 Portfolio',        desc: 'Personal or creative work showcase' },
  { value: 'restaurant', label: '🍽️ Restaurant / Food', desc: 'Menu, reservations, delivery' },
  { value: 'healthcare', label: '🏥 Healthcare',       desc: 'Medical services, clinic, wellness' },
  { value: 'blog',       label: '📝 Blog / Content',   desc: 'Articles, newsletter, media' },
  { value: 'agency',     label: '🏢 Agency / Business',desc: 'Services, case studies, contact' },
  { value: 'education',  label: '🎓 Education',        desc: 'Courses, learning, institution' },
  { value: 'other',      label: '🌐 Other',            desc: 'Anything else' },
]

const INTENTS = [
  { value: 'increase_conversions', label: '📈 Increase conversions' },
  { value: 'improve_ux',           label: '✨ Improve user experience' },
  { value: 'brand_refresh',        label: '🎨 Brand / visual refresh' },
  { value: 'accessibility',        label: '♿ Fix accessibility issues' },
  { value: 'mobile_ux',            label: '📱 Better mobile experience' },
  { value: 'seo_design',           label: '🔍 SEO-friendly structure' },
  { value: 'full_audit',           label: '🔬 Full design audit' },
]

export default function OnboardingForm({ onComplete }) {
  const { setOnboardingCompleted } = useAuthStore()
  const [step, setStep]             = useState(1) // 1=url+domain, 2=intent+info, 3=heatmap
  const [url, setUrl]               = useState('')
  const [urlError, setUrlError]     = useState('')
  const [domain, setDomain]         = useState('')
  const [intent, setIntent]         = useState('')
  const [otherInfo, setOtherInfo]   = useState('')
  const [runHeatmap, setRunHeatmap] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [heatmapLoading, setHeatmapLoading] = useState(false)
  const [done, setDone]             = useState(false)
  const [error, setError]           = useState('')

  // Pre-fill URL from landing page if available
  useEffect(() => {
    const saved = sessionStorage.getItem('aura_landing_url')
    if (saved) { setUrl(saved); sessionStorage.removeItem('aura_landing_url') }
  }, [])

  const validateUrl = (v) => {
    if (!v.trim()) return 'Website URL is required'
    if (!/^https?:\/\/.+/.test(v.trim())) return 'Include https:// e.g. https://yoursite.com'
    return ''
  }

  const goStep2 = () => {
    const err = validateUrl(url)
    if (err) { setUrlError(err); return }
    if (!domain) { setError('Please select a domain'); return }
    setError(''); setUrlError('')
    setStep(2)
  }

  const goStep3 = () => {
    if (!intent) { setError('Please select your goal'); return }
    setError('')
    setStep(3)
  }

  const handleSubmit = async (withHeatmap = false) => {
    setRunHeatmap(withHeatmap)
    if (withHeatmap) setHeatmapLoading(true)
    else setLoading(true)
    setError('')
    try {
      const res = await onboardingApi.submit({ intent, url: url.trim(), domain, other_info: otherInfo, run_heatmap: withHeatmap })
      const data = res.data.data.onboarding_data
      setOnboardingCompleted(data)
      setDone(true)
      setTimeout(() => onComplete(data), 1800)
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false); setHeatmapLoading(false)
    }
  }

  if (done) return (
    <div className="fixed inset-0 z-50 bg-aura-void/90 backdrop-blur-sm flex items-center justify-center">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-green-400" />
        </div>
        <h2 className="font-display font-bold text-xl text-aura-text mb-2">You're all set!</h2>
        <p className="text-sm text-aura-muted">Opening your workspace…</p>
      </motion.div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 bg-aura-void/80 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16,1,0.3,1] }}
        className="w-full max-w-lg bg-aura-card border border-aura-border rounded-2xl shadow-elevated overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-aura-border">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-xl bg-aura-accent/15 border border-aura-accent/25 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-aura-accent" />
            </div>
            <h2 className="font-display font-bold text-lg text-aura-text">Set up your workspace</h2>
          </div>
          <p className="text-xs text-aura-muted pl-11">Tell Aura about your site so we can tailor the analysis</p>
          {/* Step dots */}
          <div className="flex gap-1.5 mt-4 pl-11">
            {[1,2,3].map(s => (
              <div key={s} className={`h-1 rounded-full transition-all duration-300 ${s === step ? 'w-6 bg-aura-accent' : s < step ? 'w-3 bg-aura-accent/50' : 'w-3 bg-aura-border'}`} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[65vh] overflow-y-auto">
          <AnimatePresence mode="wait">

            {/* ── STEP 1: URL + Domain ── */}
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-20 }} transition={{ duration:0.25 }} className="flex flex-col gap-5">
                <div>
                  <label className="text-xs font-medium text-aura-muted tracking-wide uppercase mb-1.5 block">Website URL</label>
                  <div className={`flex items-center gap-2 bg-aura-elevated border ${urlError ? 'border-aura-error' : 'border-aura-border focus-within:border-aura-accent'} rounded-lg px-3 transition-all`}>
                    <Globe className="w-4 h-4 text-aura-faint shrink-0" />
                    <input
                      type="url"
                      value={url}
                      onChange={e => { setUrl(e.target.value); setUrlError('') }}
                      placeholder="https://yourwebsite.com"
                      className="flex-1 bg-transparent py-2.5 text-sm text-aura-text placeholder:text-aura-faint outline-none"
                    />
                  </div>
                  {urlError && <p className="mt-1 text-xs text-aura-error">{urlError}</p>}
                </div>

                <div>
                  <label className="text-xs font-medium text-aura-muted tracking-wide uppercase mb-2 block">Website Domain / Type</label>
                  <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto pr-1">
                    {DOMAINS.map(d => (
                      <button
                        key={d.value}
                        onClick={() => { setDomain(d.value); setError('') }}
                        className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-left transition-all duration-150 ${domain === d.value ? 'bg-aura-accent/10 border-aura-accent/40 text-aura-text' : 'bg-aura-elevated border-aura-border hover:border-aura-accent/25 text-aura-muted hover:text-aura-text'}`}
                      >
                        <div>
                          <p className="text-sm font-medium">{d.label}</p>
                          <p className="text-xs opacity-60">{d.desc}</p>
                        </div>
                        {domain === d.value && <div className="w-2 h-2 rounded-full bg-aura-accent shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
                {error && <p className="text-xs text-aura-error">{error}</p>}
              </motion.div>
            )}

            {/* ── STEP 2: Intent + Other info ── */}
            {step === 2 && (
              <motion.div key="step2" initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-20 }} transition={{ duration:0.25 }} className="flex flex-col gap-5">
                <div>
                  <label className="text-xs font-medium text-aura-muted tracking-wide uppercase mb-2 block">What's your main goal?</label>
                  <div className="flex flex-col gap-1.5">
                    {INTENTS.map(it => (
                      <button
                        key={it.value}
                        onClick={() => { setIntent(it.value); setError('') }}
                        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg border text-left transition-all duration-150 ${intent === it.value ? 'bg-aura-accent/10 border-aura-accent/40 text-aura-text' : 'bg-aura-elevated border-aura-border hover:border-aura-accent/25 text-aura-muted hover:text-aura-text'}`}
                      >
                        <span className="text-sm">{it.label}</span>
                        {intent === it.value && <div className="ml-auto w-2 h-2 rounded-full bg-aura-accent shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-aura-muted tracking-wide uppercase mb-1.5 block">Anything specific you want to fix? <span className="normal-case text-aura-faint">(optional)</span></label>
                  <textarea
                    value={otherInfo}
                    onChange={e => setOtherInfo(e.target.value)}
                    placeholder="e.g. My CTA button gets ignored, navigation is confusing on mobile, bounce rate is very high…"
                    rows={3}
                    className="w-full bg-aura-elevated border border-aura-border focus:border-aura-accent rounded-lg px-3.5 py-2.5 text-sm text-aura-text placeholder:text-aura-faint outline-none resize-none transition-all"
                  />
                </div>
                {error && <p className="text-xs text-aura-error">{error}</p>}
              </motion.div>
            )}

            {/* ── STEP 3: AB Test / Heatmap ── */}
            {step === 3 && (
              <motion.div key="step3" initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-20 }} transition={{ duration:0.25 }} className="flex flex-col gap-5">
                <div className="text-center py-4">
                  <div className="w-12 h-12 rounded-xl bg-aura-accent/10 border border-aura-accent/20 flex items-center justify-center mx-auto mb-4">
                    <BarChart2 className="w-5 h-5 text-aura-accent" />
                  </div>
                  <h3 className="font-display font-semibold text-base text-aura-text mb-2">Set up your initial heatmap</h3>
                  <p className="text-xs text-aura-muted leading-relaxed max-w-sm mx-auto">
                    Aura will take a full-page screenshot of <span className="text-aura-accent">{url}</span> and generate an AI-predicted attention heatmap. This becomes your baseline in the Heatmap Studio tab.
                  </p>
                </div>
                <div className="bg-aura-elevated border border-aura-border rounded-xl p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <BarChart2 className="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-aura-text">A/B Heatmap Setup</p>
                      <p className="text-xs text-aura-muted mt-0.5">Takes ~20-30 seconds. You can skip and do this from the Heatmap Studio later.</p>
                    </div>
                  </div>
                  <ul className="space-y-1.5 text-xs text-aura-muted pl-11">
                    <li className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-aura-accent" /> Full-page screenshot captured</li>
                    <li className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-aura-accent" /> AI predicts attention zones</li>
                    <li className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-aura-accent" /> Saved as default in Heatmap Studio</li>
                  </ul>
                </div>
                {error && <p className="text-xs text-aura-error">{error}</p>}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Footer Buttons */}
        <div className="px-6 py-4 border-t border-aura-border flex items-center justify-between gap-3">
          {step > 1 ? (
            <button onClick={() => setStep(s => s - 1)} className="text-xs text-aura-muted hover:text-aura-text transition-colors">← Back</button>
          ) : <div />}

          <div className="flex items-center gap-2">
            {step === 1 && (
              <button onClick={goStep2} className="flex items-center gap-1.5 bg-aura-accent hover:bg-aura-accent-dim text-white text-sm font-medium px-5 py-2 rounded-lg transition-all">
                Continue <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
            {step === 2 && (
              <button onClick={goStep3} className="flex items-center gap-1.5 bg-aura-accent hover:bg-aura-accent-dim text-white text-sm font-medium px-5 py-2 rounded-lg transition-all">
                Continue <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
            {step === 3 && (
              <>
                <button onClick={() => handleSubmit(false)} disabled={loading || heatmapLoading} className="flex items-center gap-1.5 text-sm text-aura-muted hover:text-aura-text border border-aura-border hover:border-aura-accent/30 px-4 py-2 rounded-lg transition-all disabled:opacity-40">
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}Skip heatmap
                </button>
                <button onClick={() => handleSubmit(true)} disabled={loading || heatmapLoading} className="flex items-center gap-2 bg-aura-accent hover:bg-aura-accent-dim text-white text-sm font-medium px-5 py-2 rounded-lg transition-all disabled:opacity-40">
                  {heatmapLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart2 className="w-3.5 h-3.5" />}
                  {heatmapLoading ? 'Generating…' : 'Set Up Heatmap'}
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
