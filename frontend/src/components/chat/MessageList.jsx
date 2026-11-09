import { useEffect, useRef } from 'react'
import { useChatStore } from '../../store/chatStore'
import MessageBubble from './MessageBubble'
import { motion, AnimatePresence } from 'framer-motion'

export default function MessageList({ onRetry }) {
  const { messages, isStreaming, streamingContent } = useChatStore()
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.16,1,0.3,1] }}
            >
              <MessageBubble
                message={msg}
                onRetry={msg.type === 'error' && msg.retryable ? () => onRetry?.(lastUserMsg?.content) : undefined}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {}
        {isStreaming && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {streamingContent ? (
              <MessageBubble message={{ role: 'assistant', content: streamingContent, type: 'streaming' }} />
            ) : (
              <TypingIndicator />
            )}
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <AuraAvatar />
      <div className="flex items-center gap-1.5 h-9 px-4 rounded-2xl rounded-tl-md bg-aura-card border border-aura-border">
        {[0,1,2].map(i => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-aura-accent typing-dot" style={{animationDelay:`${i*0.2}s`}} />
        ))}
      </div>
    </div>
  )
}

export function AuraAvatar() {
  return (
    <div className="w-8 h-8 rounded-xl bg-aura-accent flex items-center justify-center shrink-0 font-display font-bold text-sm text-aura-on-accent" aria-hidden="true">
      A
    </div>
  )
}
