import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import GoogleIdentityButton from '../components/auth/GoogleIdentityButton'

export default function RegisterPage() {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const { register, setAuthUser } = useAuthStore()
  const nav                     = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be 8+ characters'); return }
    setError('')
    setLoading(true)
    try {
      await register(name, email, password)
      nav('/app', { replace: true })
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-aura-void flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-aura-accent/[0.04] rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16,1,0.3,1] }}
        className="w-full max-w-sm relative z-10"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-aura-accent/15 border border-aura-accent/25 mb-4 mx-auto">
            <Sparkles className="w-5 h-5 text-aura-accent" />
          </div>
          <h1 className="font-display font-bold text-2xl text-gradient mb-1">Create Account</h1>
          <p className="text-sm text-aura-muted">Start analysing your designs</p>
        </div>

        <div className="bg-aura-card border border-aura-border rounded-2xl p-6 shadow-elevated">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input label="Name" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required />
            <Input label="Email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            <Input label="Password" type="password" placeholder="8+ characters" value={password} onChange={e => setPassword(e.target.value)} required />

            {error && (
              <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} className="text-xs text-aura-error bg-aura-error/5 border border-aura-error/20 rounded-md px-3 py-2">
                {error}
              </motion.p>
            )}

            <Button type="submit" size="lg" className="w-full mt-1" loading={loading}>
              Create Account
            </Button>
          </form>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-aura-border" />
            <span className="text-xs text-aura-faint">OR</span>
            <div className="flex-1 h-px bg-aura-border" />
          </div>

          <div className="flex justify-center">
            <GoogleIdentityButton
              onSuccess={(user) => {
                setError('')
                setAuthUser(user)
                nav('/dashboard', { replace: true })
              }}
              onError={(message) => setError(message || 'Google signup failed')}
              text="signup_with"
              theme="filled_black"
              size="large"
              shape="pill"
              width={320}
            />
          </div>
        </div>

        <p className="text-center text-xs text-aura-muted mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-aura-accent hover:text-aura-accent-glow transition-colors">Sign in</Link>
        </p>
      </motion.div>
    </div>
  )
}
