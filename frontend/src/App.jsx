import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Component, Suspense, lazy, useEffect } from 'react'
import { useAuthStore } from './store/authStore'

// Each page is its own chunk: the 3D landing page (Spline/three.js) no longer
// has to download before the app or the public survey page can render.
const LandingPage  = lazy(() => import('./pages/LandingPage'))
const LoginPage    = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const AppPage      = lazy(() => import('./pages/AppPage'))
const SurveyPage   = lazy(() => import('./pages/SurveyPage'))

function BodyClassManager() {
  const { pathname } = useLocation()
  useEffect(() => {
    const isApp = pathname.startsWith('/app') || pathname.startsWith('/dashboard')
    document.body.classList.toggle('app-mode', isApp)
    document.documentElement.style.overflow = isApp ? 'hidden' : ''
    return () => {
      document.body.classList.remove('app-mode')
      document.documentElement.style.overflow = ''
    }
  }, [pathname])
  return null
}

function FullScreenLoader() {
  return (
    <div className="h-screen flex items-center justify-center bg-aura-void">
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-aura-accent typing-dot"
            style={{ animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore()
  if (isLoading) return <FullScreenLoader />
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

// Shows a recovery screen instead of a blank page if a component crashes.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('UI error:', error, info?.componentStack)
  }
  render() {
    if (!this.state.error) return this.props.children
    const isChunkError = /Loading chunk|dynamically imported module|Importing a module script failed/i.test(String(this.state.error?.message))
    return (
      <div className="h-screen flex items-center justify-center bg-aura-void p-6">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-xl text-aura-text mb-2">Something went wrong</h1>
          <p className="text-sm text-aura-muted mb-5">
            {isChunkError ? 'A new version of Aura was released. Reload to get it.' : 'An unexpected error occurred. Reloading usually fixes it.'}
          </p>
          <button onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl bg-aura-accent text-white text-sm hover:bg-aura-accent-dim transition-colors">
            Reload page
          </button>
        </div>
      </div>
    )
  }
}

export default function App() {
  const checkAuth = useAuthStore(s => s.checkAuth)
  useEffect(() => { checkAuth() }, [checkAuth])

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <BodyClassManager />
        <Suspense fallback={<FullScreenLoader />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/survey/:token" element={<SurveyPage />} />
            <Route path="/app" element={<ProtectedRoute><AppPage /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><AppPage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
