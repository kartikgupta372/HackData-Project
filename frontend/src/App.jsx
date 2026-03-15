import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import AppPage from './pages/AppPage'
import SurveyPage from './pages/SurveyPage'

function BodyClassManager() {
  const { pathname } = useLocation()
  useEffect(() => {
    const isApp = pathname.startsWith('/app')
    document.body.classList.toggle('app-mode', isApp)
    document.documentElement.style.overflow = isApp ? 'hidden' : ''
    return () => {
      document.body.classList.remove('app-mode')
      document.documentElement.style.overflow = ''
    }
  }, [pathname])
  return null
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore()
  if (isLoading) return (
    <div className="h-screen flex items-center justify-center bg-aura-void">
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-aura-accent typing-dot"
            style={{ animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
    </div>
  )
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

export default function App() {
  const { checkAuth } = useAuthStore()
  useEffect(() => { checkAuth() }, [])

  return (
    <BrowserRouter>
      <BodyClassManager />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/survey/:token" element={<SurveyPage />} />
        <Route path="/app" element={<ProtectedRoute><AppPage /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><AppPage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
