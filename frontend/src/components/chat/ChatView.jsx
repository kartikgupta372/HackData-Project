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

// -- URL + context modal shown when starting a new session ---------------------
function NewSessionModal({ onSubmit, onSkip, loading }) {
  const [url, setUrl] = useState('')
  const [domain, setDomain] = useState('')
  const [intent, setIntent] = useState('')
  const { onboardingData } = useAuthStore()
  const inputRef = useRef(null)

  useEffect(() => {
    if (onboardingData?.url) setUrl(onboardingData.url)
    if (onboardingData?.domain) setDomain(onboardingData.domain)
    if (onboardingData?.intent) setIntent(onboardingData.intent)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e) => {
    e.preventDefault()
    let trimmed = url.trim()
    if (trimmed) {
      if (/^https?:\/\//i.test(trimmed)) { /* already has protocol */ }
      else if (/^www\./i.test(trimmed)) trimmed = 'https://' + trimmed
      else if (trimmed.includes('.')) trimmed = 'https://' + trimmed
    }
    onSubmit({ url: trimmed || null, domain: domain || null, intent: intent || null })
  }

  const selectClass = 'w-full bg-aura-card border border-aura-border rounded-xl px-4 py-2.5 text-sm text-aura-text outline-none focus:border-aura-accent transition-all appearance-none cursor-pointer'
  const selectBg = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6b80' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-6 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-xl"
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-aura-accent/10 border border-aura-accent/20">
            <div className="w-1.5 h-1.5 rounded-full bg-aura-accent animate-pulse" />
            <span className="text-xs font-mono text-aura-accent">New Analysis Session</span>
          </div>
          <h2 className="font-display font-bold text-2xl text-aura-text mb-2">
            Set up your analysis
          </h2>
          <p className="text-sm text-aura-muted max-w-sm mx-auto">
            Enter your URL and tell me about your site so I can give you the best analysis.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* URL input */}
          <div className="flex items-center gap-2 bg-aura-card border border-aura-border rounded-xl px-4 py-3 focus-within:border-aura-accent transition-all">
            <Globe className="w-4 h-4 text-aura-faint shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="yourwebsite.com or www.yoursite.com"
              className="flex-1 bg-transparent text-sm text-aura-text placeholder:text-aura-faint outline-none"
            />
            {url && (
              <button type="button" onClick={() => setUrl('')} className="text-aura-faint hover:text-aura-muted">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Domain + Intent row */}
          <div className="grid grid-cols-2 gap-2">
            <select value={domain} onChange={e => setDomain(e.target.value)} className={selectClass} style={selectBg}>
              <option value="">Website type...</option>
              {DOMAINS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <select value={intent} onChange={e => setIntent(e.target.value)} className={selectClass} style={selectBg}>
              <option value="">Main goal...</option>
              {INTENTS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSkip}
              className="flex-1 py-2.5 rounded-xl border border-aura-border text-aura-muted hover:text-aura-text hover:border-aura-accent/30 text-sm transition-all"
            >
              Skip - just chat
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-aura-accent hover:bg-aura-accent-dim disabled:opacity-40 text-white text-sm font-medium transition-all"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Scraping...</>
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
            Taking full-page screenshots and scraping content... this takes ~15-30s
          </motion.p>
        )}
      </motion.div>
    </div>
  )
}

// -- Main ChatView ------------------------------------------------------------
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

  // Every new chat session must start with the URL/form step — show modal when there is no session
  const showSessionModal = !activeSessionId || showUrlModal

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

  // Listen for "New Analysis" requests from Sidebar - show URL modal for fresh session
  useEffect(() => {
    const handler = () => setShowUrlModal(true)
    window.addEventListener('aura:request-new-session', handler)
    return () => window.removeEventListener('aura:request-new-session', handler)
  }, [])

  // Auto-send: when a recommendation card is approved, load & immediately send the first message
  useEffect(() => {
    const handler = async (e) => {
      const { sessionId, threadId } = e.detail ?? {}
      if (!sessionId || !threadId) return
      // Wait for session to load, then auto-trigger the implementation message
      setTimeout(async () => {
        try {
          const res = await chatApi.getSession(threadId)
          const msgs = res.data?.data?.session?.messages ?? []
          const firstUserMsg = msgs.find(m => m.role === 'user')
          if (firstUserMsg?.content) {
            // Pre-populate the message in store so it shows, then send it
            useChatStore.getState().startStreaming()
            await chatApi.streamMessage(
              { thread_id: threadId, session_id: sessionId, message: firstUserMsg.content },
              {
                onStage:   (d) => useChatStore.getState().setStage(d),
                onToken:   (t) => useChatStore.getState().appendToken(t),
                onMessage: () => {},
                onDone:    () => { useChatStore.getState().finishStreaming(); useChatStore.getState().setStage(null) },
                onError:   () => { useChatStore.getState().finishStreaming(); useChatStore.getState().setStage(null) },
              }
            )
          }
        } catch {}
      }, 600)
    }
    window.addEventListener('aura:auto-send-session', handler)
    return () => window.removeEventListener('aura:auto-send-session', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Create session with optional URL + form context
  const createSessionWithUrl = useCallback(async (formData) => {
    setCreatingSession(true)
    // formData can be { url, domain, intent } or null (skip)
    const siteUrl = formData?.url ?? null
    const domain  = formData?.domain ?? undefined
    const intent  = formData?.intent ?? undefined
    try {
      const res = await chatApi.createSession(siteUrl, domain, intent)
      const s = res.data.data.session
      useChatStore.getState().setActiveSession(s)
      window.dispatchEvent(new CustomEvent('aura:session-created', { detail: s }))
      setShowUrlModal(false)
      if (siteUrl) {
        // Notify user scraping is underway
        useChatStore.getState().addMessage({
          role: 'system',
          content: `Scraping **${siteUrl}** in the background — full-page screenshots and DOM analysis loading. Starting analysis now…`,
          type: 'info',
          timestamp: new Date().toISOString(),
        })
        // BUG 8 FIX: Auto-send a landing page analysis message so the chatbot
        // immediately analyses the URL without the user having to type anything.
        setTimeout(() => {
          const autoMsg = `Please analyse this website: ${siteUrl} — give me a full UX audit covering visual hierarchy, CTA effectiveness, navigation, mobile experience, and the top 3 highest-impact improvements I should make.`
          window.dispatchEvent(new CustomEvent('aura:auto-send-message', { detail: { message: autoMsg } }))
        }, 400)
      }
    } catch {
      useChatStore.getState().addMessage({
        role: 'system',
        content: 'Could not create session. Is the backend running?',
        type: 'error',
        timestamp: new Date().toISOString(),
      })
    } finally {
      setCreatingSession(false)
    }
  }, [])

  const handleSend = useCallback(async (text) => {
    if (!text.trim() || isStreaming) return

    // No session yet -> open URL modal first (user picks URL or skips)
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
          const state = useChatStore.getState()
          if (state.isStreaming && d.content != null) {
            // Use server's sanitized final content instead of accumulated stream
            finishStreaming(d.content)
          } else if (!state.streamingContent) {
            addMessage({ role: 'assistant', content: d.content, type: 'text', timestamp: new Date().toISOString() })
          }
        },
        onDone: () => {
          // If not already finished by onMessage (sanitized content), finish with local buffer
          if (useChatStore.getState().isStreaming) finishStreaming()
          setStage(null)
          window.dispatchEvent(new CustomEvent('aura:session-updated'))
        },
        onError: (e, meta) => {
          finishStreaming()
          setStage(null)
          addMessage({ role: 'system', content: `${e || 'Something went wrong'}`, type: 'error', retryable: meta?.retryable ?? false, timestamp: new Date().toISOString() })
        },
      }
    )
  }, [isStreaming, activeSessionId, activeThreadId, startStreaming, appendToken, finishStreaming, setStage, addMessage])

  // BUG 8 FIX: Listen for auto-send-message — placed AFTER handleSend definition to avoid
  // "Cannot access before initialization" error (useCallback is not hoisted)
  useEffect(() => {
    const handler = (e) => {
      const msg = e.detail?.message
      if (msg) handleSend(msg)
    }
    window.addEventListener('aura:auto-send-message', handler)
    return () => window.removeEventListener('aura:auto-send-message', handler)
  }, [handleSend])

  return (
    <div className="flex flex-col h-full bg-aura-void">

      {/* Progress bar when generating */}
      <AnimatePresence>
        {currentStage && <ProgressBar stage={currentStage} />}
      </AnimatePresence>

      {/* URL modal - shown when no session (fresh start) or user clicked "New Analysis" */}
      {showSessionModal ? (
        <NewSessionModal
          onSubmit={createSessionWithUrl}
          onSkip={() => { setShowUrlModal(false); createSessionWithUrl(null) }}
          loading={creatingSession}
        />
      ) : (
        <>
          {/* Messages area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {hasContent
              ? <MessageList onRetry={handleSend} />
              : <EmptyState onSend={handleSend} onNew={() => setShowUrlModal(true)} />
            }
          </div>

          {/* Chat input - always visible once modal is dismissed */}
          <div className="shrink-0">
            <ChatInput onSend={handleSend} disabled={isStreaming || creatingSession} />
          </div>
        </>
      )}
    </div>
  )
}

// -- Empty state shown before any messages ------------------------------------
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
            Analyse, compare, fix, or generate code - paste a URL or ask anything about your design.
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
