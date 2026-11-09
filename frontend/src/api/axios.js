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

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 120000, // scraping / AI generation can take a while
  headers: { 'Content-Type': 'application/json' },
})

let redirecting = false
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url ?? ''
    const path = window.location.pathname
    const isAuthCall = url.includes('/auth/')
    const onPublicPage = PUBLIC_PATHS.includes(path) || path.startsWith('/survey/')

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
