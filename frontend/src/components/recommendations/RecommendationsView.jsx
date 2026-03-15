import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Star, Check, X, ExternalLink, TrendingUp, ChevronRight,
  Loader2, Sparkles, MessageSquare, Wand2, Copy, Download,
  CheckSquare, Square, Zap
} from 'lucide-react'
import { recommendationsApi } from '../../api/recommendations.api'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import { useUIStore } from '../../store/uiStore'
import Spinner from '../ui/Spinner'

const IMPACT_COLOR = {
  high:   'text-red-400 bg-red-400/10 border-red-400/20',
  medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  low:    'text-green-400 bg-green-400/10 border-green-400/20',
}
const LAW_LABEL = {
  fitts:'Fitts Law', gestalt:'Gestalt', hicks:"Hick's Law",
  fpattern:'F-Pattern', hierarchy:'Visual Hierarchy',
  typography:'Typography', contrast:'Contrast',
}
const TYPE_ICON = {
  layout:'\u2B1B', color:'\uD83C\uDFA8', typography:'\uD83D\uDD24', cta:'\u26A1',
  navigation:'\uD83E\uDDED', spacing:'\uD83D\uDCCF', imagery:'\uD83D\uDDBC\uFE0F',
}
const STATUS_TABS = ['pending', 'approved', 'rejected']

const DOMAIN_OPTIONS = [
  { value: 'saas',       label: 'SaaS / App' },
  { value: 'ecommerce',  label: 'E-Commerce' },
  { value: 'portfolio',  label: 'Portfolio' },
  { value: 'restaurant', label: 'Restaurant / Food' },
  { value: 'blog',       label: 'Blog / Content' },
  { value: 'agency',     label: 'Agency / Business' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'education',  label: 'Education' },
  { value: 'other',      label: 'Other' },
]

export default function RecommendationsView() {
  const { onboardingData } = useAuthStore()
  const { setActiveSession } = useChatStore()
  const { setActiveFeature } = useUIStore()
  const [activeTab, setActiveTab]       = useState('pending')
  const [generating, setGenerating]     = useState(false)
  const [genError, setGenError]         = useState('')
  const [statusMsg, setStatusMsg]       = useState('')
  const [selectedIds, setSelectedIds]   = useState(new Set())
  const [showVibeModal, setShowVibeModal] = useState(false)
  const qc = useQueryClient()

  // User-editable URL — pre-fill from onboarding but user can change it
  const [inputUrl, setInputUrl]   = useState(onboardingData?.url || '')
  const [siteUrl, setSiteUrl]     = useState(onboardingData?.url || '')
  const [domainType, setDomainType] = useState(() => {
    const map = { ecommerce:'ecommerce', saas:'saas', portfolio:'portfolio', restaurant:'restaurant', blog:'blog', agency:'agency', healthcare:'saas', education:'saas', other:'other' }
    return map[onboardingData?.domain] || 'saas'
  })

  const handleUrlApply = () => {
    let url = inputUrl.trim()
    if (url && !/^https?:\/\//.test(url)) url = 'https://' + url
    setInputUrl(url)
    setSiteUrl(url)
    setGenError('')
    // Reset card list for new URL
    qc.invalidateQueries({ queryKey: ['rec-cards'] })
  }

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['rec-cards', activeTab, siteUrl],
    queryFn:  async () => {
      const res = await recommendationsApi.getCards({ status: activeTab, siteUrl: siteUrl || undefined, limit: 50 })
      return res.data.data
    },
    retry: 1,
  })

  // Clear selection when tab changes
  useEffect(() => { setSelectedIds(new Set()) }, [activeTab])

  const actionMutation = useMutation({
    mutationFn: ({ cardId, action }) => recommendationsApi.cardAction(cardId, action),
    onSuccess: (res, { action }) => {
      qc.invalidateQueries({ queryKey: ['rec-cards'] })
      if (action === 'approve') {
        const d   = res.data.data
        const sid = d?.session_id ?? d?.agent_session_id
        const tid = d?.thread_id  ?? d?.agent_thread_id
        if (sid && tid) {
          setActiveSession({ id: sid, thread_id: tid })
          setStatusMsg('Card approved! Opening in Chat...')
          setTimeout(() => { setActiveFeature('chat'); setStatusMsg('') }, 1500)
        } else {
          setStatusMsg('Card approved!')
          setTimeout(() => setStatusMsg(''), 2000)
        }
      }
    },
  })

  const discussMutation = useMutation({
    mutationFn: (cardId) => recommendationsApi.discuss(cardId),
    onSuccess: (res) => {
      const s = res.data.data.session
      setActiveSession({ id: s.id, thread_id: s.thread_id })
      setStatusMsg('Opening discussion in Chat...')
      setTimeout(() => { setActiveFeature('chat'); setStatusMsg('') }, 1500)
    },
  })

  const handleGenerate = async () => {
    if (!siteUrl) { setGenError('Enter a website URL above to generate recommendations'); return }
    setGenerating(true); setGenError('')
    try {
      await recommendationsApi.generateCards({ siteUrl, siteType: domainType, forceRefresh: true })
      qc.invalidateQueries({ queryKey: ['rec-cards'] })
      setActiveTab('pending')
    } catch (err) {
      setGenError(err.response?.data?.error || 'Generation failed')
    } finally { setGenerating(false) }
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === cards.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(cards.map(c => c.id)))
  }

  return (
    <div className="flex h-full bg-aura-void overflow-hidden">
      {/* Left sidebar */}
      <div className="w-64 border-r border-aura-line bg-aura-surface flex flex-col shrink-0">
        <div className="p-4 border-b border-aura-line">
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-4 h-4 text-aura-accent" />
            <h2 className="font-display font-semibold text-sm text-aura-text">Recommendations</h2>
          </div>
          <p className="text-xs text-aura-muted leading-relaxed">
            AI compares your site to top benchmarks and generates prioritised change cards
          </p>
        </div>

        {/* URL input — user enters any website they want to analyse */}
        <div className="p-3 border-b border-aura-line flex flex-col gap-2">
          <p className="text-xs text-aura-faint uppercase tracking-wide">Website to Analyse</p>
          <div className="flex gap-1.5">
            <input
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUrlApply()}
              placeholder="https://yourwebsite.com"
              className="flex-1 min-w-0 bg-aura-card border border-aura-border rounded-lg px-2.5 py-1.5 text-xs text-aura-text placeholder:text-aura-faint outline-none focus:border-aura-accent transition-all"
            />
            <button onClick={handleUrlApply}
              className="shrink-0 px-2 py-1.5 bg-aura-accent hover:bg-aura-accent-dim text-white rounded-lg text-xs font-medium transition-all">
              Set
            </button>
          </div>
          {/* Domain type selector */}
          <select
            value={domainType}
            onChange={e => setDomainType(e.target.value)}
            className="w-full bg-aura-card border border-aura-border rounded-lg px-2.5 py-1.5 text-xs text-aura-text outline-none focus:border-aura-accent transition-all cursor-pointer appearance-none"
          >
            {DOMAIN_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {siteUrl && (
            <p className="text-[10px] text-aura-accent font-mono truncate">{siteUrl}</p>
          )}
        </div>

        <div className="p-3 border-b border-aura-line flex flex-col gap-2">
          <button onClick={handleGenerate} disabled={generating || !siteUrl}
            className="w-full flex items-center justify-center gap-2 bg-aura-accent hover:bg-aura-accent-dim disabled:opacity-40 text-white text-xs font-medium px-3 py-2.5 rounded-lg transition-all">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {generating ? 'Generating...' : 'Generate New Cards'}
          </button>
          {selectedIds.size > 0 && (
            <button onClick={() => setShowVibeModal(true)}
              className="w-full flex items-center justify-center gap-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs font-medium px-3 py-2 rounded-lg transition-all">
              <Wand2 className="w-3.5 h-3.5" />
              Vibe-Coding Prompt ({selectedIds.size})
            </button>
          )}
          {genError && <p className="text-xs text-red-400">{genError}</p>}
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

      {/* Main cards area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Select-all bar — shown when pending cards exist */}
        {activeTab === 'pending' && cards.length > 0 && (
          <div className="flex items-center gap-3 px-5 py-2 border-b border-aura-line bg-aura-surface shrink-0">
            <button onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-xs text-aura-muted hover:text-aura-text transition-colors">
              {selectedIds.size === cards.length
                ? <CheckSquare className="w-3.5 h-3.5 text-aura-accent" />
                : <Square className="w-3.5 h-3.5" />}
              {selectedIds.size === cards.length ? 'Deselect all' : 'Select all'}
            </button>
            {selectedIds.size > 0 && (
              <span className="text-xs text-aura-accent font-medium">
                {selectedIds.size} selected &mdash; click <Wand2 className="w-3 h-3 inline" /> to generate Vibe-Coding Prompt
              </span>
            )}
          </div>
        )}

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
          ) : !cards.length ? (
            <EmptyCards tab={activeTab} onGenerate={handleGenerate} generating={generating} hasUrl={!!siteUrl} />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {cards.map((card, i) => (
                <motion.div key={card.id} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
                  transition={{ delay: i * 0.04, duration: 0.3 }}>
                  <RecommendationCard
                    card={card}
                    priority={i + 1}
                    selected={selectedIds.has(card.id)}
                    onSelect={() => toggleSelect(card.id)}
                    onAction={(action) => actionMutation.mutate({ cardId: card.id, action })}
                    onDiscuss={() => discussMutation.mutate(card.id)}
                    isActioning={actionMutation.isPending && actionMutation.variables?.cardId === card.id}
                    isDiscussing={discussMutation.isPending && discussMutation.variables === card.id}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showVibeModal && (
        <VibePromptModal
          cardIds={Array.from(selectedIds)}
          siteUrl={siteUrl}
          onClose={() => setShowVibeModal(false)}
        />
      )}
    </div>
  )
}

// RecommendationCard — priority badge, Discuss / Rectify / Approve / Reject actions
function RecommendationCard({ card, priority, selected, onSelect, onAction, onDiscuss, isActioning, isDiscussing }) {
  const isDecided = card.status !== 'pending'

  return (
    <div className={`rounded-xl border bg-aura-card transition-all duration-200 ${
      selected ? 'border-aura-accent/50 ring-1 ring-aura-accent/20' :
      isDecided ? 'opacity-70' : 'hover:border-aura-accent/30'
    } ${
      card.status === 'approved' ? 'border-green-500/30' :
      card.status === 'rejected' ? 'border-red-500/20' : 'border-aura-border'
    }`}>
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          {/* Checkbox (pending only) + type icon + priority badge */}
          <div className="relative shrink-0">
            {!isDecided ? (
              <button onClick={onSelect}
                className="w-8 h-8 rounded-lg bg-aura-elevated border border-aura-border flex items-center justify-center transition-colors hover:border-aura-accent/40">
                {selected
                  ? <CheckSquare className="w-4 h-4 text-aura-accent" />
                  : <span className="text-base">{TYPE_ICON[card.change_type] ?? '\uD83D\uDD27'}</span>}
              </button>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-aura-elevated border border-aura-border flex items-center justify-center text-base">
                {TYPE_ICON[card.change_type] ?? '\uD83D\uDD27'}
              </div>
            )}
            {priority && !isDecided && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-aura-accent text-white text-[9px] font-bold flex items-center justify-center leading-none">
                {priority}
              </span>
            )}
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

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="px-2 py-0.5 rounded bg-aura-accent/10 text-aura-accent border border-aura-accent/15 font-mono">
            {LAW_LABEL[card.design_law] ?? card.design_law}
          </span>
          <span className="text-aura-faint">&rarr;</span>
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

      {/* Action buttons — pending cards: Reject / Discuss / Rectify / Approve */}
      {!isDecided && (
        <div className="px-4 py-3 border-t border-aura-line flex gap-1.5">
          <button onClick={() => onAction('reject')} disabled={isActioning}
            className="flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg border border-aura-border hover:border-red-500/40 hover:bg-red-500/5 text-aura-muted hover:text-red-400 text-xs font-medium transition-all disabled:opacity-40"
            title="Reject">
            <X className="w-3.5 h-3.5" />
          </button>
          {/* Discuss — opens focused chat to understand the recommendation */}
          <button onClick={onDiscuss} disabled={isDiscussing}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-aura-border hover:border-blue-500/40 hover:bg-blue-500/5 text-aura-muted hover:text-blue-300 text-xs font-medium transition-all disabled:opacity-40"
            title="Discuss this recommendation before deciding">
            {isDiscussing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
            Discuss
          </button>
          {/* Rectify — same as Discuss but framed for fixing */}
          <button onClick={onDiscuss} disabled={isDiscussing}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-aura-border hover:border-yellow-500/40 hover:bg-yellow-500/5 text-aura-muted hover:text-yellow-300 text-xs font-medium transition-all disabled:opacity-40"
            title="Open chatbot to explore fixes">
            <Zap className="w-3.5 h-3.5" /> Rectify
          </button>
          {/* Approve → implement */}
          <button onClick={() => onAction('approve')} disabled={isActioning}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-aura-accent hover:bg-aura-accent-dim text-white text-xs font-medium transition-all disabled:opacity-40">
            {isActioning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Approve
          </button>
        </div>
      )}

      {/* Status badge for decided cards */}
      {isDecided && (
        <div className={`px-4 py-2.5 border-t border-aura-line flex items-center gap-2 ${card.status === 'approved' ? 'bg-green-500/5' : 'bg-red-500/5'}`}>
          {card.status === 'approved' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <X className="w-3.5 h-3.5 text-red-400" />}
          <span className={`text-xs font-medium capitalize ${card.status === 'approved' ? 'text-green-400' : 'text-red-400'}`}>
            {card.status === 'approved' ? 'Approved — Open in Chat' : 'Rejected'}
          </span>
          {card.status === 'approved' && card.agent_session_id && (
            <span className="ml-auto text-xs text-aura-faint font-mono">Session ready in Chat</span>
          )}
        </div>
      )}
    </div>
  )
}

// VibePromptModal — generates and displays the Vibe-Coding Prompt document
function VibePromptModal({ cardIds, siteUrl, onClose }) {
  const [prompt, setPrompt]   = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    recommendationsApi.vibePrompt({ cardIds, siteUrl })
      .then(res => setPrompt(res.data.data.prompt))
      .catch(err => setError(err.response?.data?.error || 'Generation failed'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const blob = new Blob([prompt], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'aura-vibe-prompt.txt'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
        className="w-full max-w-2xl bg-aura-card border border-aura-border rounded-2xl shadow-elevated flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-aura-border shrink-0">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-purple-400" />
            <h3 className="font-display font-semibold text-sm text-aura-text">Vibe-Coding Prompt</h3>
            <span className="text-xs text-aura-faint">({cardIds.length} changes)</span>
          </div>
          <div className="flex items-center gap-2">
            {!loading && !error && (
              <>
                <button onClick={handleCopy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${copied ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-aura-elevated border-aura-border text-aura-muted hover:text-aura-text'}`}>
                  {copied ? <><Check className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                </button>
                <button onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-aura-border bg-aura-elevated text-aura-muted hover:text-aura-text transition-all">
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
              </>
            )}
            <button onClick={onClose} className="text-aura-faint hover:text-aura-muted transition-colors ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
              <p className="text-xs text-aura-muted">Generating implementation prompt...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-aura-error/10 border border-aura-error/20">
              <p className="text-xs text-aura-error">{error}</p>
            </div>
          ) : (
            <>
              <div className="mb-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <p className="text-xs text-purple-300 leading-relaxed">
                  Paste this prompt into <strong>Cursor</strong>, <strong>GitHub Copilot</strong>, or any AI coding tool connected to your repository.
                </p>
              </div>
              <pre className="text-xs text-aura-muted leading-relaxed whitespace-pre-wrap font-mono bg-aura-elevated border border-aura-border rounded-xl p-4 select-all">
                {prompt}
              </pre>
            </>
          )}
        </div>
      </motion.div>
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
          ? 'Enter any website URL in the sidebar, pick its domain type, then click Generate New Cards.'
          : tab === 'pending'
          ? 'Click "Generate New Cards" to compare the site against top industry benchmarks.'
          : `Cards you ${tab} will appear here.`}
      </p>
      {tab === 'pending' && hasUrl && (
        <button onClick={onGenerate} disabled={generating}
          className="flex items-center gap-2 bg-aura-accent hover:bg-aura-accent-dim disabled:opacity-40 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-all">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? 'Generating...' : 'Generate Cards'}
        </button>
      )}
    </div>
  )
}
