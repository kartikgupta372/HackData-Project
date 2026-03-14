import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Activity, Camera, Link2, Eye, RefreshCw, Loader2, Plus,
  Copy, Check, BarChart2, ChevronRight, X, Layers,
  Users, ExternalLink, Sparkles, MessageSquare
} from 'lucide-react'
import { heatmapApi } from '../../api/heatmap.api'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import { useUIStore } from '../../store/uiStore'
import Spinner from '../ui/Spinner'

const VIEWS = ['surveys', 'bundles']

// ── Heat colour scale (0-100 → colour) ──────────────────────────────────────
function heatColor(v) {
  if (v === 0) return 'transparent'
  if (v < 20) return `rgba(0,0,255,${v / 100 * 0.4})`
  if (v < 40) return `rgba(0,200,255,${v / 100 * 0.5})`
  if (v < 60) return `rgba(0,255,100,${v / 100 * 0.55})`
  if (v < 80) return `rgba(255,200,0,${v / 100 * 0.65})`
  return `rgba(255,${Math.round((100 - v) * 2.5)},0,${0.7 + v / 100 * 0.3})`
}

export default function HeatmapView() {
  const { onboardingData } = useAuthStore()
  const { setActiveSession } = useChatStore()
  const { setActiveFeature } = useUIStore()
  const [activeView, setActiveView] = useState('surveys')
  const [siteUrl, setSiteUrl] = useState(onboardingData?.url || '')
  const [inputUrl, setInputUrl] = useState(onboardingData?.url || '')
  const [selectedSurvey, setSelectedSurvey] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [copiedToken, setCopiedToken] = useState(null)
  const [bundleChatMsg, setBundleChatMsg] = useState('')
  const qc = useQueryClient()

  const { data: surveys = [], isLoading: surveysLoading } = useQuery({
    queryKey: ['heatmap-surveys', siteUrl],
    queryFn: async () => { const r = await heatmapApi.getSurveys(siteUrl || undefined); return r.data.data },
    enabled: activeView === 'surveys',
    retry: 1,
  })

  const { data: bundles = [], isLoading: bundlesLoading } = useQuery({
    queryKey: ['heatmap-bundles'],
    queryFn: async () => { const r = await heatmapApi.getBundles(); return r.data.data },
    enabled: activeView === 'bundles',
    retry: 1,
  })

  const { data: surveyResults } = useQuery({
    queryKey: ['survey-results', selectedSurvey?.token],
    queryFn: async () => { const r = await heatmapApi.getSurveyResults(selectedSurvey.token); return r.data.data },
    enabled: !!selectedSurvey?.token,
    retry: 1,
  })

  const computeMutation = useMutation({
    mutationFn: (token) => heatmapApi.computeHeatmap(token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['survey-results'] }),
  })

  const bundleToChatMutation = useMutation({
    mutationFn: (bundleId) => heatmapApi.bundleToChat(bundleId),
    onSuccess: (res) => {
      const s = res.data.data.session
      setActiveSession({ id: s.id, thread_id: s.thread_id })
      setBundleChatMsg('Session created! Switching to Chat…')
      setTimeout(() => { setActiveFeature('chat'); setBundleChatMsg('') }, 1800)
    },
  })

  const copyLink = (token) => {
    const url = `${window.location.origin}/survey/${token}`
    navigator.clipboard.writeText(url)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  return (
    <div className="flex h-full bg-aura-void overflow-hidden">

      {/* ── Left panel ── */}
      <div className="w-64 border-r border-aura-line bg-aura-surface flex flex-col shrink-0">
        <div className="p-4 border-b border-aura-line">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-aura-accent" />
            <h2 className="font-display font-semibold text-sm text-aura-text">Heatmap Studio</h2>
          </div>
          <p className="text-xs text-aura-muted leading-relaxed">Screenshot surveys, click heatmaps, shareable links</p>
        </div>

        {/* URL filter */}
        <div className="p-3 border-b border-aura-line">
          <div className="flex gap-1.5">
            <input value={inputUrl} onChange={e => setInputUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && setSiteUrl(inputUrl)}
              placeholder="Filter by site URL…"
              className="flex-1 bg-aura-card border border-aura-border rounded-lg px-2.5 py-1.5 text-xs text-aura-text placeholder:text-aura-faint outline-none focus:border-aura-accent transition-all" />
            <button onClick={() => setSiteUrl(inputUrl)} className="px-2 py-1.5 bg-aura-accent hover:bg-aura-accent-dim text-white rounded-lg text-xs transition-all">→</button>
          </div>
        </div>

        {/* View tabs */}
        <div className="p-3 flex flex-col gap-1 border-b border-aura-line">
          {VIEWS.map(v => (
            <button key={v} onClick={() => setActiveView(v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium capitalize transition-all ${activeView === v ? 'bg-aura-accent/10 text-aura-accent border border-aura-accent/20' : 'text-aura-muted hover:text-aura-text hover:bg-aura-card'}`}>
              {v === 'surveys' ? <Users className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
              {v === 'surveys' ? 'Survey Links' : 'Bundles'}
            </button>
          ))}
        </div>

        {/* New survey button */}
        {activeView === 'surveys' && (
          <div className="p-3">
            <button onClick={() => setShowCreateModal(true)}
              className="w-full flex items-center justify-center gap-2 bg-aura-accent hover:bg-aura-accent-dim text-white text-xs font-medium px-3 py-2.5 rounded-lg transition-all">
              <Plus className="w-3.5 h-3.5" /> New Survey
            </button>
          </div>
        )}

        {/* Survey list */}
        {activeView === 'surveys' && (
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {surveysLoading
              ? <div className="flex justify-center py-8"><Spinner size="sm" /></div>
              : surveys.length === 0
                ? <p className="text-xs text-aura-faint text-center py-8">No surveys yet</p>
                : surveys.map(s => (
                  <button key={s.id} onClick={() => setSelectedSurvey(s)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 transition-all ${selectedSurvey?.id === s.id ? 'bg-aura-accent/10 border border-aura-accent/20' : 'hover:bg-aura-card border border-transparent'}`}>
                    <p className="text-xs font-medium text-aura-text truncate">{s.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-aura-faint">{s.response_count} responses</span>
                      <span className={`text-xs px-1 rounded ${s.is_active ? 'text-green-400' : 'text-aura-faint'}`}>{s.is_active ? '● live' : '○ closed'}</span>
                    </div>
                  </button>
                ))
            }
          </div>
        )}

        {/* Bundle list */}
        {activeView === 'bundles' && (
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {bundlesLoading
              ? <div className="flex justify-center py-8"><Spinner size="sm" /></div>
              : bundles.length === 0
                ? <p className="text-xs text-aura-faint text-center py-8">No bundles yet<br />Select surveys to bundle</p>
                : bundles.map(b => (
                  <div key={b.id} className="px-3 py-2.5 rounded-lg mb-1.5 bg-aura-card border border-aura-border">
                    <p className="text-xs font-medium text-aura-text truncate">{b.bundle_name}</p>
                    <p className="text-xs text-aura-faint mt-0.5 mb-2">{b.page_keys?.length} pages · {new Date(b.created_at).toLocaleDateString()}</p>
                    <button
                      onClick={() => bundleToChatMutation.mutate(b.id)}
                      disabled={bundleToChatMutation.isPending}
                      className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-aura-accent/10 border border-aura-accent/20 hover:bg-aura-accent/20 text-aura-accent text-xs font-medium transition-all disabled:opacity-40"
                    >
                      {bundleToChatMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageSquare className="w-3 h-3" />}
                      Send to Chat
                    </button>
                  </div>
                ))
            }
          </div>
        )}
      </div>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <AnimatePresence>
          {bundleChatMsg && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mx-4 mt-3 flex items-center gap-2 px-4 py-2.5 bg-green-500/10 border border-green-500/20 rounded-xl shrink-0">
              <Check className="w-4 h-4 text-green-400 shrink-0" />
              <p className="text-xs font-medium text-green-300">{bundleChatMsg}</p>
            </motion.div>
          )}
        </AnimatePresence>
        {selectedSurvey ? (
          <SurveyDetail
            survey={selectedSurvey}
            results={surveyResults}
            onCopy={() => copyLink(selectedSurvey.token)}
            copied={copiedToken === selectedSurvey.token}
            onCompute={() => computeMutation.mutate(selectedSurvey.token)}
            computing={computeMutation.isPending}
            onClose={() => setSelectedSurvey(null)}
          />
        ) : (
          <EmptyState activeView={activeView} onNew={() => setShowCreateModal(true)} />
        )}
      </div>

      {/* Create survey modal */}
      {showCreateModal && (
        <CreateSurveyModal
          defaultUrl={siteUrl}
          onClose={() => setShowCreateModal(false)}
          onCreated={(s) => { qc.invalidateQueries({ queryKey: ['heatmap-surveys'] }); setSelectedSurvey(s); setShowCreateModal(false) }}
        />
      )}
    </div>
  )
}

function SurveyDetail({ survey, results, onCopy, copied, onCompute, computing, onClose }) {
  const shareUrl = `${window.location.origin}/survey/${survey.token}`
  const hm = results?.heatmap_summary
  const clicks = results?.clicks ?? []

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-aura-line bg-aura-surface shrink-0">
        <button onClick={onClose} className="text-aura-faint hover:text-aura-muted transition-colors">
          <X className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-aura-text truncate">{survey.title}</h3>
          <p className="text-xs text-aura-muted">{survey.site_url} · {survey.page_key}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-aura-muted">{survey.response_count} responses</span>
          <button onClick={onCompute} disabled={computing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-aura-elevated border border-aura-border hover:border-aura-accent/30 text-aura-muted hover:text-aura-text transition-all disabled:opacity-40">
            {computing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Recompute
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {/* Shareable link card */}
        <div className="mb-5 p-4 rounded-xl bg-aura-card border border-aura-border">
          <div className="flex items-center gap-2 mb-2">
            <Link2 className="w-4 h-4 text-aura-accent" />
            <h4 className="text-sm font-medium text-aura-text">Shareable Survey Link</h4>
          </div>
          <p className="text-xs text-aura-muted mb-3">Share this link with users. They see your page screenshot and click where their attention goes.</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-aura-elevated border border-aura-border rounded-lg px-3 py-2 font-mono text-xs text-aura-accent truncate">
              {shareUrl}
            </div>
            <button onClick={onCopy}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${copied ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-aura-accent/10 border-aura-accent/25 text-aura-accent hover:bg-aura-accent/20'}`}>
              {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
            </button>
            <a href={shareUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs border border-aura-border hover:border-aura-accent/30 text-aura-muted hover:text-aura-text transition-all">
              <ExternalLink className="w-3.5 h-3.5" /> Preview
            </a>
          </div>
        </div>

        {/* Screenshot + Heatmap overlay */}
        <div className="mb-5 rounded-xl border border-aura-border overflow-hidden bg-aura-card">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-aura-line">
            <h4 className="text-xs font-medium text-aura-text flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-aura-accent" /> Heatmap Overlay
            </h4>
            {hm && <span className="text-xs text-aura-muted">{hm.above_fold_pct}% above-fold attention</span>}
          </div>
          <div className="relative" style={{ maxHeight: '500px', overflow: 'auto' }}>
            {survey.screenshot_url ? (
              <div className="relative inline-block w-full">
                <img src={survey.screenshot_url.startsWith('http') ? survey.screenshot_url : `http://localhost:3002${survey.screenshot_url}`}
                  alt="Page screenshot" className="w-full" />
                {/* Heatmap grid overlay */}
                {hm?.grid_data && (
                  <div className="absolute inset-0 pointer-events-none" style={{ display: 'grid', gridTemplateRows: `repeat(20, 1fr)`, gridTemplateColumns: `repeat(20, 1fr)` }}>
                    {JSON.parse(typeof hm.grid_data === 'string' ? hm.grid_data : JSON.stringify(hm.grid_data)).flat().map((v, i) => (
                      <div key={i} style={{ backgroundColor: heatColor(v), transition: 'background-color 0.2s' }} />
                    ))}
                  </div>
                )}
                {/* Click dots */}
                {!hm?.grid_data && clicks.slice(0, 100).map((c, i) => (
                  <div key={i} className="absolute w-3 h-3 rounded-full border-2 border-white/60"
                    style={{
                      left: `calc(${c.x_pct * 100}% - 6px)`, top: `calc(${c.y_pct * 100}% - 6px)`,
                      background: c.click_order === 1 ? 'rgba(255,50,50,0.7)' : c.click_order === 2 ? 'rgba(255,160,0,0.7)' : 'rgba(0,200,255,0.7)',
                      boxShadow: '0 0 6px rgba(0,0,0,0.5)'
                    }} />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-16">
                <p className="text-xs text-aura-faint">No screenshot available</p>
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        {hm && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'Responses', value: survey.response_count },
              { label: 'Above Fold', value: `${hm.above_fold_pct}%` },
              { label: 'Confidence', value: hm.confidence_level ?? 'low' },
            ].map(s => (
              <div key={s.label} className="p-3 rounded-lg bg-aura-card border border-aura-border text-center">
                <p className="text-lg font-display font-bold text-aura-accent">{s.value}</p>
                <p className="text-xs text-aura-muted">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Summary text */}
        {hm?.summary_text && (
          <div className="p-4 rounded-xl bg-aura-elevated border border-aura-border">
            <p className="text-xs font-medium text-aura-text mb-1 flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-aura-accent" /> AI Summary</p>
            <p className="text-xs text-aura-muted leading-relaxed">{hm.summary_text}</p>
          </div>
        )}

        {/* No data yet */}
        {!hm && !computing && survey.response_count === 0 && (
          <div className="text-center py-8">
            <Users className="w-8 h-8 text-aura-faint mx-auto mb-3" />
            <p className="text-sm text-aura-text mb-1">Waiting for responses</p>
            <p className="text-xs text-aura-muted">Share the link above to collect click data. Heatmap auto-generates at 5, 10, 20 responses.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function CreateSurveyModal({ defaultUrl, onClose, onCreated }) {
  const [url, setUrl] = useState(defaultUrl || '')
  const [pageKey, setPageKey] = useState('homepage')
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [step, setStep] = useState('url') // url | screenshot | confirm
  const [screenshotData, setScreenshotData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleScreenshot = async () => {
    if (!url.trim()) { setError('URL required'); return }
    setLoading(true); setError('')
    try {
      const res = await heatmapApi.screenshot({ url: url.trim(), pageKey })
      setScreenshotData(res.data.data)
      setStep('confirm')
    } catch (err) {
      setError(err.response?.data?.error || 'Screenshot failed')
    } finally { setLoading(false) }
  }

  const handleCreate = async () => {
    setLoading(true); setError('')
    try {
      const res = await heatmapApi.createSurvey({
        siteUrl: url.trim(), pageKey,
        pageUrl: url.trim(),
        screenshotUrl: screenshotData?.screenshot_url,
        screenshotWidth: 1280, screenshotHeight: 3000,
        title: title || `Heatmap Survey — ${pageKey}`,
        instructions: instructions || undefined,
      })
      onCreated(res.data.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create survey')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg bg-aura-card border border-aura-border rounded-2xl shadow-elevated overflow-hidden">

        <div className="flex items-center justify-between px-5 py-4 border-b border-aura-border">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-aura-accent" />
            <h3 className="font-display font-semibold text-sm text-aura-text">New Heatmap Survey</h3>
          </div>
          <button onClick={onClose} className="text-aura-faint hover:text-aura-muted"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {step === 'url' && <>
            <div>
              <label className="text-xs text-aura-muted uppercase tracking-wide mb-1.5 block">Website URL *</label>
              <input value={url} onChange={e => setUrl(e.target.value)}
                placeholder="https://yoursite.com"
                className="w-full bg-aura-elevated border border-aura-border focus:border-aura-accent rounded-lg px-3.5 py-2.5 text-sm text-aura-text placeholder:text-aura-faint outline-none transition-all" />
            </div>
            <div>
              <label className="text-xs text-aura-muted uppercase tracking-wide mb-1.5 block">Page Identifier</label>
              <input value={pageKey} onChange={e => setPageKey(e.target.value)}
                placeholder="homepage / pricing / about"
                className="w-full bg-aura-elevated border border-aura-border focus:border-aura-accent rounded-lg px-3.5 py-2.5 text-sm text-aura-text placeholder:text-aura-faint outline-none transition-all" />
            </div>
          </>}

          {step === 'confirm' && <>
            <div className="rounded-lg border border-aura-border overflow-hidden bg-aura-elevated text-center py-3">
              {screenshotData?.screenshot_url
                ? <img src={`http://localhost:3002${screenshotData.screenshot_url}`} alt="Preview" className="max-h-48 mx-auto object-contain rounded" />
                : <p className="text-xs text-aura-faint py-8">Screenshot captured ({screenshotData?.element_count} elements)</p>}
            </div>
            <div>
              <label className="text-xs text-aura-muted uppercase tracking-wide mb-1.5 block">Survey Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder={`Heatmap Survey — ${pageKey}`}
                className="w-full bg-aura-elevated border border-aura-border focus:border-aura-accent rounded-lg px-3.5 py-2.5 text-sm text-aura-text placeholder:text-aura-faint outline-none transition-all" />
            </div>
            <div>
              <label className="text-xs text-aura-muted uppercase tracking-wide mb-1.5 block">Instructions for participants <span className="normal-case text-aura-faint">(optional)</span></label>
              <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={2}
                placeholder="Click on the areas that catch your eye first…"
                className="w-full bg-aura-elevated border border-aura-border focus:border-aura-accent rounded-lg px-3.5 py-2.5 text-sm text-aura-text placeholder:text-aura-faint outline-none transition-all resize-none" />
            </div>
          </>}

          {error && <p className="text-xs text-aura-error">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-aura-border flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs text-aura-muted border border-aura-border hover:border-aura-accent/30 transition-all">Cancel</button>
          {step === 'url'
            ? <button onClick={handleScreenshot} disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-aura-accent hover:bg-aura-accent-dim text-white text-xs font-medium rounded-lg transition-all disabled:opacity-40">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              {loading ? 'Capturing…' : 'Take Screenshot'}
            </button>
            : <button onClick={handleCreate} disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-aura-accent hover:bg-aura-accent-dim text-white text-xs font-medium rounded-lg transition-all disabled:opacity-40">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              {loading ? 'Creating…' : 'Create Survey & Get Link'}
            </button>
          }
        </div>
      </motion.div>
    </div>
  )
}

function EmptyState({ activeView, onNew }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <div className="w-16 h-16 rounded-2xl bg-aura-card border border-aura-border flex items-center justify-center mx-auto mb-4">
        {activeView === 'surveys' ? <Users className="w-7 h-7 text-aura-faint" /> : <Layers className="w-7 h-7 text-aura-faint" />}
      </div>
      <p className="text-sm font-medium text-aura-text mb-2">
        {activeView === 'surveys' ? 'No surveys yet' : 'No bundles yet'}
      </p>
      <p className="text-xs text-aura-muted max-w-xs mb-6">
        {activeView === 'surveys'
          ? 'Create a survey to capture a full-page screenshot and generate a shareable link. Participants click where they look, you get a heatmap.'
          : 'Bundles group multiple page heatmaps together. Select surveys and bundle them to send to the AI chatbot for analysis.'}
      </p>
      {activeView === 'surveys' && (
        <button onClick={onNew} className="flex items-center gap-2 bg-aura-accent hover:bg-aura-accent-dim text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-all">
          <Plus className="w-4 h-4" /> Create First Survey
        </button>
      )}
    </div>
  )
}
