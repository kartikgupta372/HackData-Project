import { useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatStore } from '../../store/chatStore'
import { chatApi } from '../../api/chat.api'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import ProgressBar from './ProgressBar'
import { Globe, Zap, BarChart2 } from 'lucide-react'

const SUGGESTIONS = [
  { icon: Globe,     text: 'Analyse my landing page', sub: 'Paste a URL for full UX audit' },
  { icon: Zap,       text: 'Improve my CTA',          sub: 'Boost conversion with design laws' },
  { icon: BarChart2, text: 'Compare designs',         sub: 'Benchmark against top sites' },
]

export default function ChatView() {
  const {
    messages, isStreaming, streamingContent, currentStage,
    activeSessionId, activeThreadId,
    startStreaming, appendToken, finishStreaming, setStage, addMessage,
  } = useChatStore()

  const hasContent = messages.length > 0 || isStreaming

  const handleSend = useCallback(async (text) => {
    if (!text.trim() || isStreaming) return

    // Grab session IDs — may need to create one first
    let sessionId = activeSessionId
    let threadId  = activeThreadId

    if (!sessionId) {
      try {
        const res = await chatApi.createSession()
        const s   = res.data.data.session
        useChatStore.getState().setActiveSession(s)
        sessionId = s.id
        threadId  = s.thread_id
        // Notify Sidebar to refresh session list
        window.dispatchEvent(new CustomEvent('aura:session-created', { detail: s }))
      } catch (err) {
        addMessage({ role: 'system', content: 'Could not create session. Is the backend running?', type: 'error', timestamp: new Date().toISOString() })
        return
      }
    }

    addMessage({ role: 'user', content: text, type: 'text', timestamp: new Date().toISOString() })
    startStreaming()

    await chatApi.streamMessage(
      { thread_id: threadId, session_id: sessionId, message: text },
      {
        onStage: (d) => setStage(d),
        onToken: (t) => appendToken(t),
        onMessage: (d) => {
          // Only add full message if no tokens came in (non-streaming node)
          if (!useChatStore.getState().streamingContent) {
            addMessage({
              role: 'assistant',
              content: d.content,
              type: 'text',
              timestamp: new Date().toISOString(),
            })
          }
        },
        onDone: () => {
          finishStreaming()
          setStage(null)
          // Refresh sidebar session list (title may have updated)
          window.dispatchEvent(new CustomEvent('aura:session-updated'))
        },
        onError: (e) => {
          finishStreaming()
          setStage(null)
          addMessage({
            role: 'system',
            content: `⚠️ ${e || 'Something went wrong'}`,
            type: 'error',
            timestamp: new Date().toISOString(),
          })
        },
      }
    )
  }, [isStreaming, activeSessionId, activeThreadId, startStreaming, appendToken, finishStreaming, setStage, addMessage])

  return (
    <div className="flex flex-col h-full bg-aura-void">
      <AnimatePresence>
        {currentStage && <ProgressBar stage={currentStage} />}
      </AnimatePresence>

      {!hasContent ? (
        <EmptyState onSend={handleSend} />
      ) : (
        <MessageList />
      )}

      <div className="shrink-0">
        <ChatInput onSend={handleSend} disabled={isStreaming} />
      </div>
    </div>
  )
}

function EmptyState({ onSend }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16,1,0.3,1] }}
        className="w-full max-w-2xl"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-aura-accent/10 border border-aura-accent/20">
            <div className="w-1.5 h-1.5 rounded-full bg-aura-accent animate-pulse-slow" />
            <span className="text-xs font-mono text-aura-accent">AI Design Intelligence</span>
          </div>
          <h1 className="font-display font-bold text-3xl text-aura-text mb-2 leading-tight">
            What would you like<br />
            <span className="text-gradient">to analyse today?</span>
          </h1>
          <p className="text-sm text-aura-muted max-w-md mx-auto">
            Paste a URL or describe your design challenge. I'll audit it using Fitts's Law, Gestalt, F-Pattern and more.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-8">
          {SUGGESTIONS.map((s, i) => {
            const Icon = s.icon
            return (
              <motion.button
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.07, duration: 0.4, ease: [0.16,1,0.3,1] }}
                onClick={() => onSend(s.text)}
                className="group p-4 rounded-xl bg-aura-card border border-aura-border hover:border-aura-accent/40 hover:bg-aura-elevated text-left transition-all duration-200 hover:shadow-glow-sm"
              >
                <Icon className="w-4 h-4 text-aura-accent mb-3" />
                <p className="text-sm font-medium text-aura-text mb-1">{s.text}</p>
                <p className="text-xs text-aura-muted">{s.sub}</p>
              </motion.button>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}
