import { useRef, useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatStore } from '../../store/chatStore'
import { useAuthStore } from '../../store/authStore'
import { chatApi } from '../../api/chat.api'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import ProgressBar from './ProgressBar'
import { Globe, Zap, BarChart2, ArrowRight, Loader2, X } from 'lucide-react'

const SUGGESTIONS = [
  { icon: Globe,     text: 'Analyse my website',          sub: 'Paste a URL for full UX audit' },
  { icon: Zap,       text: 'What is wrong with my CTA?',  sub: 'Get design law analysis' },
  { icon: BarChart2, text: 'Compare my site with Stripe', sub: 'Benchmark against top sites' },
]

// ── URL input modal shown when starting a new session ─────────────────────────
function NewSessionModal({ onSubmit, onSkip, loading }) {
  const [url, setUrl] = useState('')
  const { onboardingData } = useAuthStore()
  const inputRef = useRef(null)

  useEffect(() => {
    if (onboardingData?.url) setUrl(onboardingData.url)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e) => {
    e.preventDefault()
    let trimmed = url.trim()
    if (trimmed && !/^https?:\/\//.test(trimmed)) trimmed = 'https://' + trimmed
    onSubmit(trimmed || null)
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-xl"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-aura-accent/10 border border-aura-accent/20">
            <div className="w-1.5 h-1.5 rounded-full bg-aura-accent animate-pulse" />
            <span className="text-xs font-mono text-aura-accent">New Analysis Session</span>
          </div>
          <h2 className="font-display font-bold text-2xl text-aura-text mb-2">
            Which website should I analyse?
          </h2>
          <p className="text-sm text-aura-muted max-w-sm mx-auto">
            Enter your URL and I'll scrape all pages, take full-page screenshots, and give you a complete analysis.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex items-center gap-2 bg-aura-card border border-aura-border rounded-xl px-4 py-3 focus-within:border-aura-accent transition-all">
            <Globe className="w-4 h-4 text-aura-faint shrink-0" />
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://yourwebsite.com"
              className="flex-1 bg-transparent text-sm text-aura-text placeholder:text-aura-faint outline-none"
            />
            {url && (
              <button type="button" onClick={() => setUrl('')} className="text-aura-faint hover:text-aura-muted">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSkip}
              className="flex-1 py-2.5 rounded-xl border border-aura-border text-aura-muted hover:text-aura-text hover:border-aura-accent/30 text-sm transition-all"
            >
              Skip — just chat
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-aura-accent hover:bg-aura-accent-dim disabled:opacity-40 text-white text-sm font-medium transition-all"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Scraping…</>
                : <><ArrowRight className="w-4 h-4" />Start Analysis</>}
            </button>
          </div>
        </form>

        {loading && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 text-center text-xs text-aura-muted"
          >
            Taking full-page screenshots and scraping content… this takes ~15–30s
          </motion.p>
        )}
      </motion.div>
    </div>
  )
}

// ── Main ChatView ──────────────────────────────────────────────────────────────
export default function ChatView() {
  const {
    messages, isStreaming, currentStage,
    activeSessionId, activeThreadId,
    startStreaming, appendToken, finishStreaming, setStage, addMessage, setMessages,
  } = useChatStore()

  const [showUrlModal, setShowUrlModal] = useState(false)
  const [creatingSession, setCreatingSession] = useState(false)

  const hasContent    = messages.length > 0 || isStreaming
  const hasSession    = !!activeSessionId

  // Load existing messages when switching sessions (e.g. from Recommendations approve)
  useEffect(() => {
    if (!activeSessionId || !activeThreadId) return
    chatApi.getSession(activeThreadId)
      .then(res => {
        const msgs = res.data?.data?.session?.messages ?? []
        if (msgs.length > 0) {
          setMessages(msgs.map(m => ({
            id: m.id ?? Math.random(),
            role: m.role,
            content: m.content,
            type: m.content_type ?? 'text',
            timestamp: m.created_at,
          })))
        }
      })
      .catch(() => {})
  }, [activeSessionId, activeThreadId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Create session with optional URL
  const createSessionWithUrl = useCallback(async (siteUrl) => {
    setCreatingSession(true)
    try {
      const res = await chatApi.createSession(siteUrl ?? undefined)
      const s = res.data.data.session
      useChatStore.getState().setActiveSession(s)
      window.dispatchEvent(new CustomEvent('aura:session-created', { detail: s }))
      setShowUrlModal(false)
      if (siteUrl) {
        useChatStore.getState().addMessage({
          role: 'system',
          content: `🔍 Scraping **${siteUrl}** in the background — full-page screenshots and DOM analysis will be ready shortly. You can start chatting now!`,
          type: 'info',
          timestamp: new Date().toISOString(),
        })
      }
    } catch {
      useChatStore.getState().addMessage({
        role: 'system',
        content: '❌ Could not create session. Is the backend running?',
        type: 'error',
        timestamp: new Date().toISOString(),
      })
    } finally {
      setCreatingSession(false)
    }
  }, [])

  const handleSend = useCallback(async (text) => {
    if (!text.trim() || isStreaming) return

    // No session yet → open URL modal first (user picks URL or skips)
    if (!activeSessionId) {
      setShowUrlModal(true)
      return
    }

    addMessage({ role: 'user', content: text, type: 'text', timestamp: new Date().toISOString() })
    startStreaming()

    await chatApi.streamMessage(
      { thread_id: activeThreadId, session_id: activeSessionId, message: text },
      {
        onStage:   (d) => setStage(d),
        onToken:   (t) => appendToken(t),
        onMessage: (d) => {
          // Only add as discrete message if we're NOT accumulating tokens
          if (!useChatStore.getState().streamingContent) {
            addMessage({ role: 'assistant', content: d.content, type: 'text', timestamp: new Date().toISOString() })
          }
        },
        onDone: () => {
          finishStreaming()
          setStage(null)
          window.dispatchEvent(new CustomEvent('aura:session-updated'))
        },
        onError: (e) => {
          finishStreaming()
          setStage(null)
          addMessage({ role: 'system', content: `⚠️ ${e || 'Something went wrong'}`, type: 'error', timestamp: new Date().toISOString() })
        },
      }
    )
  }, [isStreaming, activeSessionId, activeThreadId, startStreaming, appendToken, finishStreaming, setStage, addMessage])

  return (
    <div className="flex flex-col h-full bg-aura-void">

      {/* Progress bar when agents are running */}
      <AnimatePresence>
        {currentStage && <ProgressBar stage={currentStage} />}
      </AnimatePresence>

      {/* URL modal — shown when no session or user wants to start fresh */}
      {showUrlModal ? (
        <NewSessionModal
          onSubmit={createSessionWithUrl}
          onSkip={() => { setShowUrlModal(false); createSessionWithUrl(null) }}
          loading={creatingSession}
        />
      ) : (
        <>
          {/* Messages area */}
          <div className="flex-1 overflow-hidden">
            {hasContent
              ? <MessageList />
              : <EmptyState onSend={handleSend} onNew={() => setShowUrlModal(true)} />
            }
          </div>

          {/* Chat input — always visible once modal is dismissed */}
          <div className="shrink-0">
            <ChatInput onSend={handleSend} disabled={isStreaming || creatingSession} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Empty state shown before any messages ──────────────────────────────────────
function EmptyState({ onSend, onNew }) {
  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center px-6 pb-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-2xl"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-aura-accent/10 border border-aura-accent/20">
            <div className="w-1.5 h-1.5 rounded-full bg-aura-accent animate-pulse" />
            <span className="text-xs font-mono text-aura-accent">Full-Power AI Design Assistant</span>
          </div>
          <h1 className="font-display font-bold text-3xl text-aura-text mb-2 leading-tight">
            What would you like<br />
            <span className="text-gradient">to work on today?</span>
          </h1>
          <p className="text-sm text-aura-muted max-w-md mx-auto">
            Analyse, compare, fix, or generate code — paste a URL or ask anything about your design.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {SUGGESTIONS.map((s, i) => {
            const Icon = s.icon
            return (
              <motion.button
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.07, duration: 0.4 }}
                onClick={() => onSend(s.text)}
                className="group p-4 rounded-xl bg-aura-card border border-aura-border hover:border-aura-accent/40 hover:bg-aura-elevated text-left transition-all duration-200"
              >
                <Icon className="w-4 h-4 text-aura-accent mb-3" />
                <p className="text-sm font-medium text-aura-text mb-1">{s.text}</p>
                <p className="text-xs text-aura-muted">{s.sub}</p>
              </motion.button>
            )
          })}
        </div>

        <div className="text-center">
          <button
            onClick={onNew}
            className="text-xs text-aura-accent hover:underline transition-colors"
          >
            + Start new session with a website URL
          </button>
        </div>
      </motion.div>
    </div>
  )
}
