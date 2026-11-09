import { useEffect, useState } from 'react'
import { Github, UserRound } from 'lucide-react'
import { authApi } from '../../api/auth.api'
import { useAuthStore } from '../../store/authStore'
import { API_BASE } from '../../api/axios'

const AUTH_ERRORS = {
  github_not_configured: 'GitHub sign-in is not set up yet.',
  github_denied: 'GitHub sign-in was cancelled.',
  github_state: 'That GitHub sign-in expired. Please try again.',
  github_no_email: 'Your GitHub account has no verified email. Add one on GitHub, or use another option.',
  github_failed: 'GitHub sign-in failed. Please try again or use another option.',
}

export function authErrorMessage(code) {
  return code ? (AUTH_ERRORS[code] || 'Sign-in failed. Please try another option.') : ''
}

/**
 * Backup sign-in options shown under the email form: GitHub (when configured on
 * the server) and one-click guest access. Which ones appear comes from the
 * server, so nothing broken is ever shown.
 */
export default function AlternativeSignIn({ onSuccess, onError }) {
  const [providers, setProviders] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    authApi.providers()
      .then((r) => { if (!cancelled) setProviders(r.data.data) })
      .catch(() => { if (!cancelled) setProviders({}) })
    return () => { cancelled = true }
  }, [])

  const guest = async () => {
    setBusy(true)
    try {
      const user = await useAuthStore.getState().loginAsGuest()
      onSuccess?.(user)
    } catch (err) {
      onError?.(err?.response?.data?.error || 'Could not start a guest session')
    } finally {
      setBusy(false)
    }
  }

  if (!providers || (!providers.github && !providers.guest)) return null

  const btn = 'w-full flex items-center justify-center gap-2 h-10 rounded-full border border-aura-border text-sm text-aura-text hover:bg-aura-border/30 transition-colors disabled:opacity-50'

  return (
    <div className="flex flex-col gap-2 mt-3">
      {providers.github && (
        <a href={`${API_BASE || ''}/auth/github`} className={btn}>
          <Github className="w-4 h-4" /> Continue with GitHub
        </a>
      )}
      {providers.guest && (
        <button type="button" onClick={guest} disabled={busy} className={btn}>
          <UserRound className="w-4 h-4" /> {busy ? 'Starting…' : 'Continue as guest'}
        </button>
      )}
      <p className="text-[11px] text-aura-faint text-center mt-1">
        Google not working? Use email above, GitHub, or try as a guest.
      </p>
    </div>
  )
}
