import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check, Download, RotateCcw, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { AuraAvatar } from './MessageList'
import { clsx } from 'clsx'

export default function MessageBubble({ message, onRetry }) {
  const isUser      = message.role === 'user'
  const isStreaming = message.type === 'streaming'
  const isError     = message.type === 'error'
  const isRetryable = isError && message.retryable

  if (isUser) {
    return <UserBubble content={message.content} />
  }

  if (isError) {
    return (
      <div className="flex items-start gap-3">
        <AuraAvatar />
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-start gap-2.5 px-4 py-3 rounded-xl bg-aura-error/10 border border-aura-error/40 max-w-[85%]">
            <AlertTriangle className="w-4 h-4 text-aura-error shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-aura-text leading-relaxed">{message.content}</p>
              {isRetryable && onRetry && (
                <button onClick={onRetry}
                  className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-aura-on-accent bg-aura-accent hover:bg-aura-accent-glow px-3 py-1.5 rounded-lg transition-colors">
                  <RotateCcw className="w-3 h-3" /> Try again
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3">
      <AuraAvatar />
      <div className="flex-1 min-w-0 rounded-2xl rounded-tl-md bg-aura-card border border-aura-border px-5 py-4 shadow-card">
        <p className="text-xs font-semibold text-aura-accent mb-2">Aura{isStreaming ? ' is writing…' : ''}</p>
        <div className={clsx('prose-aura text-[15px]', isStreaming && 'stream-cursor')}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code: CodeBlock,
              pre: ({ children }) => <>{children}</>,
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

const LONG_REQUEST = 320

// Long user messages (for example the implementation request sent when a card
// is approved) collapse to a short preview so they do not bury the answer.
function UserBubble({ content }) {
  const [open, setOpen] = useState(false)
  const text = String(content ?? '')
  const long = text.length > LONG_REQUEST

  if (!long) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] px-4 py-2.5 rounded-2xl rounded-br-md bg-aura-accent text-aura-on-accent text-sm font-medium leading-relaxed shadow-sm whitespace-pre-wrap break-words">
          {text}
        </div>
      </div>
    )
  }

  const preview = text.replace(/\*\*/g, '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 2).join(' ')

  return (
    <div className="flex justify-end">
      <div className="max-w-[78%] rounded-2xl rounded-br-md bg-aura-card border-2 border-aura-accent/60 px-4 py-3">
        <p className="text-xs font-semibold text-aura-accent mb-1.5">Your request</p>
        {open
          ? <p className="text-sm text-aura-text leading-relaxed whitespace-pre-wrap break-words">{text.replace(/\*\*/g, '')}</p>
          : <p className="text-sm text-aura-text leading-relaxed line-clamp-3 break-words">{preview}</p>}
        <button
          onClick={() => setOpen(o => !o)}
          className="mt-2 text-xs font-semibold text-aura-accent hover:text-aura-accent-glow underline underline-offset-4"
        >
          {open ? 'Show less' : 'Show full request'}
        </button>
      </div>
    </div>
  )
}

function CodeBlock({ inline, className, children, ...props }) {
  const [copied, setCopied] = useState(false)
  const match = /language-(\w+)/.exec(className || '')
  const lang = match?.[1] || 'text'
  const code = String(children).replace(/\n$/, '')

  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const download = () => {
    const ext = lang === 'css' ? 'css' : lang === 'javascript' ? 'js' : 'html'
    const blob = new Blob([code], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `aura-enhanced.${ext}`
    a.click()
  }

  if (inline) {
    return <code className={className} {...props}>{children}</code>
  }

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-aura-border bg-aura-void">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-aura-card border-b border-aura-border">
        <span className="text-xs font-mono text-aura-muted">{lang}</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={download}
            className="flex items-center gap-1 text-xs text-aura-muted hover:text-aura-text px-2 py-1 rounded-md hover:bg-aura-elevated transition-colors"
          >
            <Download className="w-3 h-3" /> Download
          </button>
          <button
            onClick={copy}
            className="flex items-center gap-1 text-xs text-aura-muted hover:text-aura-text px-2 py-1 rounded-md hover:bg-aura-elevated transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-aura-success" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        language={lang}
        style={oneDark}
        PreTag="div"
        customStyle={{
          margin: 0,
          background: '#0A0C10',
          fontSize: '0.78rem',
          fontFamily: '"JetBrains Mono", monospace',
          padding: '1rem',
          maxHeight: '400px',
          overflowY: 'auto',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
