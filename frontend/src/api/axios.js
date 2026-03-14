import axios from 'axios'

// In dev: Vite proxies /auth, /chat, etc. → localhost:3002
// In prod: VITE_API_URL points to the deployed backend
const baseURL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL,
  withCredentials: true,   // send HttpOnly cookies on every request
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// Global 401 interceptor — redirect to login, but skip /auth/me
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url ?? ''
    const is401 = err.response?.status === 401
    const isAuthCheck = url.includes('/auth/me')

    if (is401 && !isAuthCheck) {
      // Small delay so any in-flight requests can settle
      setTimeout(() => { window.location.href = '/login' }, 100)
    }
    return Promise.reject(err)
  }
)

export default api
