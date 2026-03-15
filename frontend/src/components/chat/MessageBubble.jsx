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
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-aura-accent/15 border border-aura-accent/25 text-sm text-aura-text leading-relaxed">
          {message.content}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-start gap-3">
        <AuraAvatar />
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/20 max-w-[85%]">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-300 leading-relaxed">{message.content}</p>
              {isRetryable && onRetry && (
                <button onClick={onRetry}
                  className="mt-2 flex items-center gap-1.5 text-xs text-aura-accent hover:text-aura-text border border-aura-accent/30 hover:border-aura-accent/60 px-2.5 py-1.5 rounded-lg transition-all">
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
      <div className={clsx(
        'flex-1 min-w-0 prose-aura text-sm',
        isStreaming && 'stream-cursor',
      )}>
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
    <div className="my-3 rounded-xl overflow-hidden border border-aura-border bg-[#0d0d12]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-aura-card border-b border-aura-border">
        <span className="text-[10px] font-mono uppercase tracking-widest text-aura-faint">{lang}</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={download}
            className="flex items-center gap-1 text-[10px] text-aura-muted hover:text-aura-text px-2 py-1 rounded hover:bg-aura-elevated transition-colors"
          >
            <Download className="w-3 h-3" /> Download
          </button>
          <button
            onClick={copy}
            className="flex items-center gap-1 text-[10px] text-aura-muted hover:text-aura-text px-2 py-1 rounded hover:bg-aura-elevated transition-colors"
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
          background: '#0d0d12',
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
