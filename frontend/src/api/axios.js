import axios from 'axios'

// Empty in dev (Vite proxies API paths to the backend) and in single-service
// production (the backend serves this app). Set VITE_API_URL only when the
// frontend is hosted separately from the backend.
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

/** Turn a backend-relative path like "/uploads/x.png" into a loadable URL. */
export function resolveAssetUrl(url) {
  if (!url) return url
  if (/^(https?:|data:|blob:)/i.test(url)) return url
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`
}

const PUBLIC_PATHS = ['/', '/login', '/register']

// ── Access token ─────────────────────────────────────────────────────────────
// The short-lived access token is kept in memory only (never localStorage), so
// a script injected into the page cannot read a long-lived credential. The
// httpOnly refresh cookie mints a new one when it expires.
let accessToken = null
let accessExpiresAt = 0
const EXPIRY_MARGIN_MS = 30 * 1000

export function setAccessToken(token, expiresInSeconds) {
  accessToken = token || null
  accessExpiresAt = token && expiresInSeconds ? Date.now() + expiresInSeconds * 1000 : 0
}
export function clearAccessToken() { setAccessToken(null) }
export function getAccessToken() { return accessToken }

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 120000, // scraping / AI generation can take a while
  headers: { 'Content-Type': 'application/json' },
})

// Plain client for the refresh call, so it never triggers its own retry loop.
const bare = axios.create({ baseURL: API_BASE, withCredentials: true, timeout: 20000 })

let refreshing = null
/** Exchange the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshAccessToken() {
  if (!refreshing) {
    refreshing = bare.post('/auth/refresh')
      .then((res) => {
        const d = res.data?.data
        setAccessToken(d?.accessToken, d?.expiresIn)
        return d
      })
      .catch((err) => { clearAccessToken(); throw err })
      .finally(() => { refreshing = null })
  }
  return refreshing
}

/** A token that is valid for at least the next 30 seconds, refreshing first if needed. */
export async function getFreshAccessToken() {
  if (accessToken && Date.now() < accessExpiresAt - EXPIRY_MARGIN_MS) return accessToken
  try { await refreshAccessToken() } catch { /* fall back to the cookie */ }
  return accessToken
}

api.interceptors.request.use((config) => {
  if (accessToken && !config.headers.Authorization) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

// Sign-in style responses carry a new access token.
api.interceptors.response.use((res) => {
  const d = res.data?.data
  if (d?.accessToken) setAccessToken(d.accessToken, d.expiresIn)
  return res
})

const NO_RETRY = ['/auth/login', '/auth/register', '/auth/guest', '/auth/refresh', '/auth/logout']

let redirecting = false
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    const url = original?.url ?? ''
    const path = window.location.pathname
    const isAuthCall = url.includes('/auth/')
    const onPublicPage = PUBLIC_PATHS.includes(path) || path.startsWith('/survey/')

    // Expired access token: refresh once, then replay the request.
    if (err.response?.status === 401 && original && !original._retried && !NO_RETRY.some((p) => url.includes(p))) {
      original._retried = true
      try {
        await refreshAccessToken()
        if (accessToken) original.headers.Authorization = `Bearer ${accessToken}`
        else delete original.headers.Authorization
        return api(original)
      } catch { /* refresh failed: fall through to the sign-in redirect */ }
    }

    if (err.response?.status === 401 && !isAuthCall && !onPublicPage && !redirecting) {
      redirecting = true
      window.location.assign('/login')
    }
    if (!err.response) {
      err.message = 'Cannot reach the server. Check your connection and try again.'
    }
    return Promise.reject(err)
  }
)

export default api
