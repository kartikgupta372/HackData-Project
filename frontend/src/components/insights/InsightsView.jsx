import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Lightbulb, AlertCircle, AlertTriangle, Info,
  MessageSquare, Check, RefreshCw, Loader2,
  ChevronRight, Sparkles, X
} from 'lucide-react'
import { insightsApi } from '../../api/insights.api'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import { useUIStore } from '../../store/uiStore'
import Spinner from '../ui/Spinner'

const SEV = {
  critical: { cls: 'text-red-400 bg-red-400/10 border-red-400/20',         Icon: AlertCircle,   label: 'Critical' },
  high:     { cls: 'text-orange-400 bg-orange-400/10 border-orange-400/20', Icon: AlertTriangle, label: 'High' },
  medium:   { cls: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', Icon: Info,          label: 'Medium' },
  low:      { cls: 'text-green-400 bg-green-400/10 border-green-400/20',    Icon: Info,          label: 'Low' },
}

const TYPE_LABEL = {
  ignored_cta: 'Ignored CTA', poor_hierarchy: 'Poor Hierarchy',
  overloaded_content: 'Overloaded', misaligned_nav: 'Nav Issue',
  low_attention: 'Low Attention', accessibility: 'Accessibility',
  mobile_ux: 'Mobile UX', general: 'General',
}

const STATUS_TABS = ['new', 'reviewed', 'actioned', 'dismissed']

export default function InsightsView() {
  const { onboardingData } = useAuthStore()
  const { setActiveSession } = useChatStore()
  const { setActiveFeature } = useUIStore()
  const [activeTab, setActiveTab]   = useState('new')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError]     = useState('')
  const [statusMsg, setStatusMsg]   = useState('')
  const [siteUrl, setSiteUrl] = useState(onboardingData?.url || '')
  const [inputUrl, setInputUrl] = useState(onboardingData?.url || '')
  const qc = useQueryClient()

  const normaliseUrl = (raw) => {
    const t = raw.trim()
    if (!t) return t
    if (/^https?:\/\//i.test(t)) return t
    if (/^www\./i.test(t)) return 'https://' + t
    if (t.includes('.')) return 'https://' + t
    return t
  }

  const { data: insights = [], isLoading } = useQuery({
    queryKey: ['insights', activeTab, siteUrl],
    queryFn: async () => {
      const res = await insightsApi.getAll({ siteUrl: siteUrl || undefined, status: activeTab })
      return res.data.data
    },
    retry: 1,
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => insightsApi.setStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insights'] }),
  })

  const chatMutation = useMutation({
    mutationFn: (id) => insightsApi.sendToChat(id),
    onSuccess: (res) => {
      const s = res.data.data.session
      setActiveSession({ id: s.id, thread_id: s.thread_id })
      setStatusMsg('Opening in Chat...')
      setTimeout(() => { setActiveFeature('chat'); setStatusMsg('') }, 1500)
      qc.invalidateQueries({ queryKey: ['insights'] })
    },
  })

  const handleGenerate = async () => {
    if (!siteUrl) { setGenError('Complete onboarding to set your site URL'); return }
    setGenerating(true); setGenError('')
    try {
      await insightsApi.generate({ siteUrl })
      qc.invalidateQueries({ queryKey: ['insights'] })
      setActiveTab('new')
    } catch (err) {
      setGenError(err.response?.data?.error || 'Generation failed — run a heatmap survey first')
    } finally { setGenerating(false) }
  }

  return (
    <div className="flex h-full bg-aura-void overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r border-aura-line bg-aura-surface flex flex-col shrink-0">
        <div className="p-4 border-b border-aura-line">
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb className="w-4 h-4 text-aura-accent" />
            <h2 className="font-display font-semibold text-sm text-aura-text">Insight Engine</h2>
          </div>
          <p className="text-xs text-aura-muted leading-relaxed">
            Auto-generated UX findings from heatmap &amp; page data
          </p>
        </div>

        {/* URL filter / setter */}
        <div className="p-3 border-b border-aura-line">
          <div className="flex gap-1.5">
            <input value={inputUrl} onChange={e => setInputUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const s = normaliseUrl(inputUrl)
                  setInputUrl(s); setSiteUrl(s);
                }
              }}
              placeholder="Site URL to analyse..."
              className="flex-1 bg-aura-card border border-aura-border rounded-lg px-2.5 py-1.5 text-xs text-aura-text placeholder:text-aura-faint outline-none focus:border-aura-accent transition-all" />
            <button onClick={() => {
              const s = normaliseUrl(inputUrl)
              setInputUrl(s); setSiteUrl(s);
            }}
              className="px-2 py-1.5 bg-aura-accent hover:bg-aura-accent-dim text-white rounded-lg text-xs transition-all">{'→'}</button>
          </div>
        </div>

        <div className="p-4 border-b border-aura-line">
          <button onClick={() => {
            const s = normaliseUrl(inputUrl);
            setInputUrl(s); setSiteUrl(s);
            handleGenerate();
          }} disabled={generating}
            className="w-full flex items-center justify-center gap-2 bg-aura-accent hover:bg-aura-accent-dim disabled:opacity-40 text-white text-xs font-medium px-3 py-2.5 rounded-lg transition-all">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {generating ? 'Analysing...' : 'Generate Insights'}
          </button>
          {genError && <p className="mt-2 text-xs text-aura-error leading-relaxed">{genError}</p>}
        </div>

        <div className="p-3 flex flex-col gap-1">
          {STATUS_TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium capitalize transition-all ${
                activeTab === tab
                  ? 'bg-aura-accent/10 text-aura-accent border border-aura-accent/20'
                  : 'text-aura-muted hover:text-aura-text hover:bg-aura-card'
              }`}>
              <span>{tab}</span>
              <ChevronRight className="w-3 h-3 opacity-50" />
            </button>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 overflow-y-auto p-5">
        <AnimatePresence>
          {statusMsg && (
            <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
              className="mb-4 flex items-center gap-3 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl">
              <Check className="w-4 h-4 text-green-400 shrink-0" />
              <p className="text-xs font-medium text-green-300">{statusMsg}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" className="text-aura-accent" /></div>
        ) : !insights.length ? (
          <EmptyInsights tab={activeTab} onGenerate={handleGenerate} generating={generating} hasUrl={!!siteUrl} />
        ) : (
          <div className="flex flex-col gap-3">
            {insights.map((ins, i) => (
              <motion.div key={ins.id} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}>
                <InsightCard
                  insight={ins}
                  onChat={() => chatMutation.mutate(ins.id)}
                  onStatus={(s) => statusMutation.mutate({ id: ins.id, status: s })}
                  isChatting={chatMutation.isPending && chatMutation.variables === ins.id}
                  isUpdating={statusMutation.isPending && statusMutation.variables?.id === ins.id}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function InsightCard({ insight, onChat, onStatus, isChatting, isUpdating }) {
  const sev = SEV[insight.severity] ?? SEV.medium
  const SevIcon = sev.Icon
  const isActioned = ['actioned', 'dismissed'].includes(insight.status)

  return (
    <div className={`rounded-xl border bg-aura-card transition-all duration-200 ${
      isActioned ? 'opacity-60' : 'hover:border-aura-accent/25'
    } border-aura-border`}>
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${sev.cls}`}>
            <SevIcon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-sm font-semibold text-aura-text leading-tight">{insight.title}</h3>
              <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${sev.cls}`}>
                {sev.label}
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-aura-elevated border border-aura-border text-aura-faint">
                {TYPE_LABEL[insight.insight_type] ?? insight.insight_type}
              </span>
            </div>
            <p className="text-xs text-aura-muted leading-relaxed">{insight.description}</p>
          </div>
        </div>

        {/* Evidence + Recommendation */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="p-2.5 rounded-lg bg-aura-elevated border border-aura-border">
            <p className="text-[10px] text-aura-faint uppercase tracking-wide mb-1">Evidence</p>
            <p className="text-xs text-aura-muted leading-relaxed">{insight.evidence}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-aura-accent/5 border border-aura-accent/15">
            <p className="text-[10px] text-aura-accent uppercase tracking-wide mb-1">Fix</p>
            <p className="text-xs text-aura-muted leading-relaxed">{insight.recommendation}</p>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 text-xs text-aura-faint">
          <span className="font-mono">{insight.page_key}</span>
          <span>&middot;</span>
          <span>{insight.element_target}</span>
        </div>
      </div>

      {/* Action bar */}
      <div className="px-4 py-3 border-t border-aura-line flex items-center gap-2">
        {!isActioned && (
          <>
            <button onClick={() => onStatus('reviewed')} disabled={isUpdating || insight.status === 'reviewed'}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-aura-border hover:border-aura-accent/30 text-aura-muted hover:text-aura-text transition-all disabled:opacity-40">
              <Check className="w-3 h-3" /> Mark Reviewed
            </button>
            <button onClick={() => onStatus('dismissed')} disabled={isUpdating}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-aura-border hover:border-red-500/30 text-aura-muted hover:text-red-400 transition-all disabled:opacity-40">
              <X className="w-3 h-3" /> Dismiss
            </button>
          </>
        )}
        <button onClick={onChat} disabled={isChatting}
          className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-aura-accent/10 border border-aura-accent/25 hover:bg-aura-accent/20 text-aura-accent font-medium transition-all disabled:opacity-40">
          {isChatting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
          Discuss in Chat
        </button>
      </div>
    </div>
  )
}

function EmptyInsights({ tab, onGenerate, generating, hasUrl }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-aura-card border border-aura-border flex items-center justify-center mx-auto mb-4">
        <Lightbulb className="w-6 h-6 text-aura-faint" />
      </div>
      <p className="text-sm font-medium text-aura-text mb-2">
        {tab === 'new' ? 'No insights yet' : `No ${tab} insights`}
      </p>
      <p className="text-xs text-aura-muted max-w-xs mb-6">
        {!hasUrl
          ? 'Complete onboarding to set your site URL first.'
          : tab === 'new'
          ? 'Generate insights after running at least one heatmap survey. The engine analyses attention data and page structure to find UX problems.'
          : `Insights you ${tab} will appear here.`}
      </p>
      {tab === 'new' && hasUrl && (
        <button onClick={onGenerate} disabled={generating}
          className="flex items-center gap-2 bg-aura-accent hover:bg-aura-accent-dim disabled:opacity-40 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-all">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? 'Analysing...' : 'Generate Insights'}
        </button>
      )}
    </div>
  )
}
