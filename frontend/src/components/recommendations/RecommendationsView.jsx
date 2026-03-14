import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Star, Check, X, ExternalLink, TrendingUp, ChevronRight,
         Loader2, Sparkles, ArrowRight } from 'lucide-react'
import { recommendationsApi } from '../../api/recommendations.api'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import { useUIStore } from '../../store/uiStore'
import Spinner from '../ui/Spinner'

const IMPACT_COLOR = { high: 'text-red-400 bg-red-400/10 border-red-400/20', medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', low: 'text-green-400 bg-green-400/10 border-green-400/20' }
const LAW_LABEL = { fitts:'Fitts Law', gestalt:'Gestalt', hicks:"Hick's Law", fpattern:'F-Pattern', hierarchy:'Visual Hierarchy', typography:'Typography', contrast:'Contrast' }
const TYPE_ICON = { layout:'â¬›', color:'ðŸŽ¨', typography:'ðŸ”¤', cta:'âš¡', navigation:'ðŸ§­', spacing:'ðŸ“', imagery:'ðŸ–¼ï¸' }
const STATUS_TABS = ['pending','approved','rejected']

export default function RecommendationsView() {
  const { onboardingData } = useAuthStore()
  const { setActiveSession } = useChatStore()
  const { setActiveFeature } = useUIStore()
  const [activeTab, setActiveTab]   = useState('pending')
  const [generating, setGenerating] = useState(false)
  const [autoGenTriggered, setAutoGenTriggered] = useState(false)
  const [genError, setGenError]     = useState('')
  const [approvedMsg, setApprovedMsg] = useState('')
  const qc = useQueryClient()

  // Auto-trigger card generation when user first opens Recommendations with onboarding URL
  // Use a flag stored outside render to avoid stale closure on handleGenerate
  const shouldAutoGen = !autoGenTriggered && !!siteUrl && !isLoading && cards.length === 0 && activeTab === 'pending' && !generating
  useEffect(() => {
    if (shouldAutoGen) {
      setAutoGenTriggered(true)
    }
  }, [shouldAutoGen])

  const siteUrl  = onboardingData?.url    || ''
  const domainMap = { ecommerce:'ecommerce', saas:'saas', portfolio:'portfolio', restaurant:'restaurant', blog:'blog', agency:'agency', healthcare:'saas', education:'saas', other:'other' }
  const siteType = domainMap[onboardingData?.domain] || 'saas'

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['rec-cards', activeTab, siteUrl],
    queryFn: async () => {
      const res = await recommendationsApi.getCards({ status: activeTab, siteUrl: siteUrl || undefined, limit: 50 })
      return res.data.data
    },
    retry: 1,
  })

  const actionMutation = useMutation({
    mutationFn: ({ cardId, action }) => recommendationsApi.cardAction(cardId, action),
    onSuccess: (res, { action }) => {
      qc.invalidateQueries({ queryKey: ['rec-cards'] })
      if (action === 'approve') {
        const d = res.data.data
        if (d?.agent_session_id && d?.agent_thread_id) {
          // Switch to the newly created agent session in chat
          setActiveSession({ id: d.agent_session_id, thread_id: d.agent_thread_id })
          setApprovedMsg('âœ… Card approved! Opening implementation session in Chatâ€¦')
          setTimeout(() => { setActiveFeature('chat'); setApprovedMsg('') }, 1500)
        } else {
          setApprovedMsg('âœ… Card approved!')
          setTimeout(() => setApprovedMsg(''), 2000)
        }
      } else {
        setApprovedMsg('')
      }
    },
  })

  // Trigger auto-generate after autoGenTriggered flips (handleGenerate is now in scope)
  useEffect(() => {
    if (autoGenTriggered && !generating && cards.length === 0) {
      handleGenerate()
    }
  }, [autoGenTriggered]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async () => {
    if (!siteUrl) { setGenError('Complete onboarding first to set your site URL'); return }
    setGenerating(true); setGenError('')
    try {
      await recommendationsApi.generateCards({ siteUrl, siteType })
      qc.invalidateQueries({ queryKey: ['rec-cards'] })
      setActiveTab('pending')
    } catch (err) {
      setGenError(err.response?.data?.error || 'Generation failed')
    } finally { setGenerating(false) }
  }

  return (
    <div className="flex h-full bg-aura-void overflow-hidden">

      {/* â”€â”€ Left sidebar â”€â”€ */}
      <div className="w-64 border-r border-aura-line bg-aura-surface flex flex-col shrink-0">
        <div className="p-4 border-b border-aura-line">
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-4 h-4 text-aura-accent" />
            <h2 className="font-display font-semibold text-sm text-aura-text">Recommendations</h2>
          </div>
          <p className="text-xs text-aura-muted leading-relaxed">AI compares your site to top benchmarks and generates change cards</p>
        </div>

        {/* Site info */}
        {siteUrl && (
          <div className="px-4 py-3 border-b border-aura-line">
            <p className="text-xs text-aura-faint uppercase tracking-wide mb-1">Analysing</p>
            <p className="text-xs text-aura-accent font-mono truncate">{siteUrl}</p>
            <span className="text-xs text-aura-muted capitalize">{siteType}</span>
          </div>
        )}

        {/* Generate button */}
        <div className="p-4 border-b border-aura-line">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full flex items-center justify-center gap-2 bg-aura-accent hover:bg-aura-accent-dim disabled:opacity-40 text-white text-xs font-medium px-3 py-2.5 rounded-lg transition-all"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {generating ? 'Generatingâ€¦' : 'Generate New Cards'}
          </button>
          {genError && <p className="mt-2 text-xs text-aura-error">{genError}</p>}
        </div>

        {/* Status tabs */}
        <div className="p-3 flex flex-col gap-1">
          {STATUS_TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium capitalize transition-all ${activeTab === tab ? 'bg-aura-accent/10 text-aura-accent border border-aura-accent/20' : 'text-aura-muted hover:text-aura-text hover:bg-aura-card'}`}>
              <span>{tab}</span>
              <ChevronRight className="w-3 h-3 opacity-50" />
            </button>
          ))}
        </div>
      </div>

      {/* â”€â”€ Main cards area â”€â”€ */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* Approved banner */}
        <AnimatePresence>
          {approvedMsg && (
            <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
              className="mb-4 flex items-center gap-3 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl">
              <Check className="w-4 h-4 text-green-400 shrink-0" />
              <p className="text-xs font-medium text-green-300">{approvedMsg}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" className="text-aura-accent" /></div>
        ) : !cards.length ? (
          <EmptyCards tab={activeTab} onGenerate={handleGenerate} generating={generating} hasUrl={!!siteUrl} />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {cards.map((card, i) => (
              <motion.div key={card.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }}>
                <RecommendationCard card={card} onAction={(action) => actionMutation.mutate({ cardId: card.id, action })} isPending={actionMutation.isPending && actionMutation.variables?.cardId === card.id} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RecommendationCard({ card, onAction, isPending }) {
  const [expanded, setExpanded] = useState(false)
  const isDecided = card.status !== 'pending'

  return (
    <div className={`rounded-xl border bg-aura-card transition-all duration-200 ${isDecided ? 'opacity-70' : 'hover:border-aura-accent/30'} ${card.status === 'approved' ? 'border-green-500/30' : card.status === 'rejected' ? 'border-red-500/20' : 'border-aura-border'}`}>

      {/* Card header */}
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-aura-elevated border border-aura-border flex items-center justify-center text-base shrink-0">
            {TYPE_ICON[card.change_type] ?? 'ðŸ”§'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-sm font-semibold text-aura-text leading-tight">{card.title}</h3>
              <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${IMPACT_COLOR[card.impact_level] ?? IMPACT_COLOR.medium}`}>
                {card.impact_level}
              </span>
            </div>
            <p className="text-xs text-aura-muted leading-relaxed">{card.description}</p>
          </div>
        </div>

        {/* Before / After */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="p-2.5 rounded-lg bg-red-500/5 border border-red-500/15">
            <p className="text-xs text-red-400 font-medium mb-1">Before</p>
            <p className="text-xs text-aura-muted leading-relaxed">{card.before_snippet}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-green-500/5 border border-green-500/15">
            <p className="text-xs text-green-400 font-medium mb-1">After</p>
            <p className="text-xs text-aura-muted leading-relaxed">{card.after_snippet}</p>
          </div>
        </div>

        {/* Metadata row */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="px-2 py-0.5 rounded bg-aura-accent/10 text-aura-accent border border-aura-accent/15 font-mono">
            {LAW_LABEL[card.design_law] ?? card.design_law}
          </span>
          <span className="text-aura-faint">â†’</span>
          <span className="text-aura-muted capitalize">{card.element_target}</span>
          <span className="ml-auto text-aura-faint capitalize">{card.page_key}</span>
        </div>
      </div>

      {/* Inspiration source */}
      <div className="px-4 py-2.5 border-t border-aura-line bg-aura-elevated/50 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
        <span className="text-xs text-aura-faint">Inspired by</span>
        <a href={card.inspired_url} target="_blank" rel="noreferrer"
          className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium transition-colors">
          {card.inspired_by} <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>

      {/* Action buttons â€” only for pending cards */}
      {!isDecided && (
        <div className="px-4 py-3 border-t border-aura-line flex gap-2">
          <button
            onClick={() => onAction('reject')}
            disabled={isPending}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-aura-border hover:border-red-500/40 hover:bg-red-500/5 text-aura-muted hover:text-red-400 text-xs font-medium transition-all disabled:opacity-40"
          >
            <X className="w-3.5 h-3.5" /> Reject
          </button>
          <button
            onClick={() => onAction('approve')}
            disabled={isPending}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-aura-accent hover:bg-aura-accent-dim text-white text-xs font-medium transition-all disabled:opacity-40"
          >
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Approve â†’ Agent
          </button>
        </div>
      )}

      {/* Status badge for decided cards */}
      {isDecided && (
        <div className={`px-4 py-2.5 border-t border-aura-line flex items-center gap-2 ${card.status === 'approved' ? 'bg-green-500/5' : 'bg-red-500/5'}`}>
          {card.status === 'approved' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <X className="w-3.5 h-3.5 text-red-400" />}
          <span className={`text-xs font-medium capitalize ${card.status === 'approved' ? 'text-green-400' : 'text-red-400'}`}>
            {card.status === 'approved' ? 'Approved â€” Agent tasked' : 'Rejected'}
          </span>
          {card.status === 'approved' && card.agent_session_id && (
            <span className="ml-auto text-xs text-aura-faint font-mono">Session ready in Chat</span>
          )}
        </div>
      )}
    </div>
  )
}

function EmptyCards({ tab, onGenerate, generating, hasUrl }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-aura-card border border-aura-border flex items-center justify-center mx-auto mb-4">
        <TrendingUp className="w-6 h-6 text-aura-faint" />
      </div>
      <p className="text-sm font-medium text-aura-text mb-2">
        {tab === 'pending' ? 'No recommendation cards yet' : `No ${tab} cards`}
      </p>
      <p className="text-xs text-aura-muted max-w-xs mb-6">
        {!hasUrl
          ? 'Complete onboarding to set your site URL, then generate cards.'
          : tab === 'pending'
          ? 'Click "Generate New Cards" to let AI compare your site against top benchmarks and suggest improvements.'
          : `Cards you ${tab} will appear here.`}
      </p>
      {tab === 'pending' && hasUrl && (
        <button onClick={onGenerate} disabled={generating}
          className="flex items-center gap-2 bg-aura-accent hover:bg-aura-accent-dim disabled:opacity-40 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-all">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? 'Generatingâ€¦' : 'Generate Cards'}
        </button>
      )}
    </div>
  )
}




