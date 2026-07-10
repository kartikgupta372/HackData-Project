import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url ?? ''
    const is401 = err.response?.status === 401
    const isAuthCheck = url.includes('/auth/me')

    if (is401 && !isAuthCheck) {
      setTimeout(() => { window.location.href = '/login' }, 100)
    }
    return Promise.reject(err)
  }
)

export default api
