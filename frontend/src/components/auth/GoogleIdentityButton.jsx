import { useEffect, useRef, useState } from 'react'

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = GIS_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(script)
  })
}

export default function GoogleIdentityButton({
  onSuccess,
  onError,
  text = 'continue_with',
  theme = 'filled_black',
  size = 'large',
  shape = 'pill',
  width = 320,
  className = '',
}) {
  const buttonRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
      if (!clientId) {
        const msg = 'Missing Google client id. Set VITE_GOOGLE_CLIENT_ID in frontend .env.'
        setError(msg)
        onError?.(msg)
        return
      }

      try {
        await loadGoogleScript()
        if (cancelled) return

        if (!window.google?.accounts?.id) {
          throw new Error('Google Identity Services not available')
        }

        window.google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          callback: async (response) => {
            if (!response?.credential) {
              const msg = 'Google did not return a credential token'
              setError(msg)
              onError?.(msg)
              return
            }

            setError('')
            setLoading(true)
            try {
              const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3003'
              const res = await fetch(`${apiBase}/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ credential: response.credential }),
              })

              const data = await res.json().catch(() => ({}))
              if (!res.ok) {
                throw new Error(data?.error || 'Google authentication failed')
              }

              onSuccess?.(data?.data?.user ?? null, data)
            } catch (err) {
              const msg = err?.message || 'Google authentication failed'
              setError(msg)
              onError?.(msg)
            } finally {
              setLoading(false)
            }
          },
        })

        if (buttonRef.current) {
          buttonRef.current.innerHTML = ''
          window.google.accounts.id.renderButton(buttonRef.current, {
            theme,
            size,
            text,
            shape,
            width,
          })
        }
      } catch (err) {
        const msg = err?.message || 'Failed to initialize Google login'
        setError(msg)
        onError?.(msg)
      }
    }

    init()

    return () => {
      cancelled = true
      if (buttonRef.current) buttonRef.current.innerHTML = ''
    }
  }, [onSuccess, onError, text, theme, size, shape, width])

  return (
    <div className={className}>
      <div ref={buttonRef} />
      {loading && <p className="text-xs text-aura-muted mt-2 text-center">Signing in...</p>}
      {error && <p className="text-xs text-aura-error mt-2 text-center">{error}</p>}
    </div>
  )
}
