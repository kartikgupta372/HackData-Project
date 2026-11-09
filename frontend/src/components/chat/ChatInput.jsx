import { useRef, useState, useEffect } from 'react'
import { ArrowUp, Globe } from 'lucide-react'
import { clsx } from 'clsx'

export default function ChatInput({ onSend, disabled }) {
  const [value, setValue] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = Math.min(ref.current.scrollHeight, 160) + 'px'
    }
  }, [value])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const submit = () => {
    const text = value.trim()
    if (!text || disabled) return
    onSend(text)
    setValue('')
    if (ref.current) ref.current.style.height = 'auto'
  }

  const pasteUrl = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text.startsWith('http')) setValue(text)
    } catch {}
  }

  return (
    <div className="px-4 pb-5 pt-3">
      <div className="max-w-3xl mx-auto">
        <div className={clsx(
          'flex flex-col rounded-2xl bg-aura-card border-2 transition-colors duration-150',
          disabled ? 'border-aura-line' : 'border-aura-border hover:border-aura-faint focus-within:border-aura-accent'
        )}>
          <textarea
            ref={ref}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Paste a URL to audit, or ask about a design…"
            rows={1}
            className="resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm text-aura-text placeholder:text-aura-faint outline-none font-body leading-relaxed disabled:opacity-50 min-h-[52px]"
          />
          <div className="flex items-center justify-between px-3 pb-3">
            <button
              onClick={pasteUrl}
              className="flex items-center gap-1.5 text-xs text-aura-muted hover:text-aura-text transition-colors px-2.5 py-1.5 rounded-lg hover:bg-aura-elevated"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Paste URL</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-aura-faint hidden sm:inline">Enter to send, Shift+Enter for a new line</span>
              <button
                aria-label="Send message"
                onClick={submit}
                disabled={disabled || !value.trim()}
                className={clsx(
                  'w-9 h-9 rounded-xl flex items-center justify-center transition-colors duration-150',
                  value.trim() && !disabled
                    ? 'bg-aura-accent hover:bg-aura-accent-glow text-aura-on-accent'
                    : 'bg-aura-elevated text-aura-faint cursor-not-allowed'
                )}
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        <p className="text-center text-xs text-aura-faint mt-2.5">
          Aura judges design with Fitts's law, Gestalt, the F-pattern and visual hierarchy.
        </p>
      </div>
    </div>
  )
}
