import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../store/authStore'

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load Google sign-in')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = GIS_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google sign-in'))
    document.head.appendChild(script)
  })
}

/**
 * Google sign-in button. Renders nothing when VITE_GOOGLE_CLIENT_ID isn't set,
 * so a missing key never shows an error on the login page.
 */
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

  // Keep the latest callbacks without re-initialising Google on every render.
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)
  useEffect(() => { onSuccessRef.current = onSuccess; onErrorRef.current = onError })

  useEffect(() => {
    if (!CLIENT_ID) return undefined
    let cancelled = false

    const fail = (msg) => {
      if (cancelled) return
      setError(msg)
      onErrorRef.current?.(msg)
    }

    loadGoogleScript()
      .then(() => {
        if (cancelled) return
        if (!window.google?.accounts?.id) throw new Error('Google sign-in is not available')

        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          ux_mode: 'popup',
          callback: async (response) => {
            if (!response?.credential) return fail('Google did not return a sign-in token')
            setError('')
            setLoading(true)
            try {
              const user = await useAuthStore.getState().loginWithGoogle(response.credential)
              if (!cancelled) onSuccessRef.current?.(user)
            } catch (err) {
              fail(err?.response?.data?.error || err?.message || 'Google sign-in failed')
            } finally {
              if (!cancelled) setLoading(false)
            }
          },
        })

        if (buttonRef.current) {
          buttonRef.current.innerHTML = ''
          window.google.accounts.id.renderButton(buttonRef.current, { theme, size, text, shape, width })
        }
      })
      .catch((err) => fail(err?.message || 'Failed to initialise Google sign-in'))

    const node = buttonRef.current
    return () => {
      cancelled = true
      if (node) node.innerHTML = ''
    }
  }, [text, theme, size, shape, width])

  if (!CLIENT_ID) return null

  return (
    <div className={className}>
      <div ref={buttonRef} />
      {loading && <p className="text-xs text-aura-muted mt-2 text-center">Signing in...</p>}
      {error && <p className="text-xs text-aura-error mt-2 text-center">{error}</p>}
    </div>
  )
}
