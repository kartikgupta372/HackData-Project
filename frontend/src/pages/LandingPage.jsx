import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sparkles, ArrowRight, BarChart2, Zap, Brain, Eye, Shield, ChevronRight } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

const HOW_IT_WORKS = [
  { icon: Eye,      step: '01', title: 'Enter Your URL',        desc: 'Paste your website URL. Aura scrapes and analyses every page instantly.' },
  { icon: Brain,    step: '02', title: 'AI Analyses Design',    desc: "Our 8-agent pipeline applies Fitts's Law, Gestalt, F-Pattern & more to your live site." },
  { icon: BarChart2,step: '03', title: 'Heatmap Predictions',  desc: 'See where users actually look — AI-predicted or from real session data.' },
  { icon: Zap,      step: '04', title: 'Actionable Insights',  desc: 'Get scored recommendations and enhanced HTML/CSS, ready to ship.' },
]

const FEATURES = [
  { title: '8-Agent AI Pipeline',  desc: 'LangGraph orchestrates specialists: DOM intake, design analysis, code enhancement, heatmap, and more.' },
  { title: 'RAG Benchmark Engine', desc: 'Compares your site against 50+ curated benchmarks (Stripe, Linear, Nobu) using semantic vector search.' },
  { title: 'Real Heatmaps',        desc: 'Time-weighted attention data: first 3 seconds count 4× more. Or use AI prediction for new sites.' },
  { title: 'Design Law Scoring',   desc: "Scores across Fitts, Hick's, Gestalt, F-Pattern, Typography, Contrast, Visual Hierarchy." },
  { title: 'Enhanced Code Output', desc: 'Agents produce actual HTML/CSS fixes, not just advice. Download and deploy directly.' },
  { title: 'Privacy First',        desc: 'HttpOnly cookies, bcrypt passwords. Your data never leaves your account.' },
]

export default function LandingPage() {
  const [url, setUrl]       = useState('')
  const [urlError, setUrlError] = useState('')
  const { isAuthenticated } = useAuthStore()
  const nav = useNavigate()
  const inputRef = useRef(null)

  const handleAnalyse = () => {
    const trimmed = url.trim()
    if (!trimmed) { inputRef.current?.focus(); return }
    if (!/^https?:\/\/.+/.test(trimmed)) {
      setUrlError('Please include https:// e.g. https://yoursite.com')
      return
    }
    setUrlError('')
    // Store URL for onboarding form to pre-fill
    sessionStorage.setItem('aura_landing_url', trimmed)
    nav(isAuthenticated ? '/app' : '/register')
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleAnalyse() }

  return (
    <div className="min-h-screen bg-aura-void text-aura-text overflow-x-hidden">

      {/* ── Ambient background ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/3 w-[600px] h-[600px] bg-aura-accent/[0.04] rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/[0.03] rounded-full blur-3xl" />
      </div>

      {/* ── Nav ── */}
      <nav className="relative z-20 flex items-center justify-between px-6 md:px-12 py-5 border-b border-white/[0.04]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-aura-accent/15 border border-aura-accent/25 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-aura-accent" />
          </div>
          <span className="font-display font-bold text-base tracking-tight text-aura-text">Aura Design AI</span>
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <Link to="/app">
              <button className="flex items-center gap-1.5 text-sm font-medium bg-aura-accent hover:bg-aura-accent-dim text-white px-4 py-2 rounded-md transition-all duration-150 shadow-glow-sm">
                Open App <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-sm text-aura-muted hover:text-aura-text transition-colors px-3 py-2">
                Sign In
              </Link>
              <Link to="/register">
                <button className="flex items-center gap-1.5 text-sm font-medium bg-aura-accent hover:bg-aura-accent-dim text-white px-4 py-2 rounded-md transition-all duration-150 shadow-glow-sm">
                  Get Started <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-24 pb-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16,1,0.3,1] }}>
          <div className="inline-flex items-center gap-2 mb-6 px-3.5 py-1.5 rounded-full bg-aura-accent/10 border border-aura-accent/20">
            <div className="w-1.5 h-1.5 rounded-full bg-aura-accent animate-pulse" />
            <span className="text-xs font-mono text-aura-accent tracking-wide">AI-Powered UX Intelligence</span>
          </div>

          <h1 className="font-display font-bold text-4xl md:text-6xl leading-[1.1] mb-5 max-w-3xl">
            Your website,{' '}
            <span className="text-gradient">scientifically analysed</span>
          </h1>
          <p className="text-aura-muted text-lg md:text-xl max-w-xl mb-10 leading-relaxed">
            Paste a URL. Aura's 8-agent AI pipeline audits every page against Fitts's Law, Gestalt, F-Pattern, heatmaps, and 50+ benchmark sites — then tells you exactly what to fix.
          </p>

          {/* URL Input */}
          <div className="w-full max-w-xl mx-auto">
            <div className={`flex items-center gap-0 rounded-xl border ${urlError ? 'border-aura-error' : 'border-aura-border focus-within:border-aura-accent'} bg-aura-card transition-all duration-200 focus-within:shadow-glow-sm overflow-hidden`}>
              <div className="pl-4 pr-2 text-aura-faint shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <input
                ref={inputRef}
                type="url"
                value={url}
                onChange={e => { setUrl(e.target.value); setUrlError('') }}
                onKeyDown={handleKeyDown}
                placeholder="https://yourwebsite.com"
                className="flex-1 bg-transparent py-3.5 px-2 text-sm text-aura-text placeholder:text-aura-faint outline-none font-body"
              />
              <button
                onClick={handleAnalyse}
                className="shrink-0 m-1 flex items-center gap-2 bg-aura-accent hover:bg-aura-accent-dim text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-all duration-150"
              >
                Analyse <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {urlError && <p className="mt-1.5 text-xs text-aura-error text-left px-1">{urlError}</p>}
            <p className="mt-2.5 text-xs text-aura-faint">Free to start · No credit card required</p>
          </div>
        </motion.div>
      </section>

      {/* ── How it Works ── */}
      <section className="relative z-10 px-6 md:px-12 py-20 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="font-display font-bold text-2xl md:text-3xl mb-3">How Aura works</h2>
            <p className="text-aura-muted text-sm">Four steps from URL to actionable design intelligence</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {HOW_IT_WORKS.map((item, i) => {
              const Icon = item.icon
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5, ease: [0.16,1,0.3,1] }}
                  className="relative p-5 rounded-xl bg-aura-card border border-aura-border hover:border-aura-accent/30 transition-all duration-200 group"
                >
                  <div className="absolute top-4 right-4 font-mono text-xs text-aura-faint">{item.step}</div>
                  <div className="w-9 h-9 rounded-lg bg-aura-accent/10 border border-aura-accent/20 flex items-center justify-center mb-4">
                    <Icon className="w-4 h-4 text-aura-accent" />
                  </div>
                  <h3 className="font-display font-semibold text-sm text-aura-text mb-2">{item.title}</h3>
                  <p className="text-xs text-aura-muted leading-relaxed">{item.desc}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section className="relative z-10 px-6 md:px-12 py-20 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="font-display font-bold text-2xl md:text-3xl mb-3">Everything you need</h2>
            <p className="text-aura-muted text-sm">Built for serious website owners, agencies, and developers</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.4 }}
                className="p-5 rounded-xl bg-aura-card border border-aura-border hover:border-aura-accent/25 transition-colors duration-200"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-aura-accent" />
                  <h3 className="font-display font-semibold text-sm text-aura-text">{f.title}</h3>
                </div>
                <p className="text-xs text-aura-muted leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative z-10 px-6 py-20 border-t border-white/[0.04]">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-2xl mx-auto text-center"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-aura-accent/15 border border-aura-accent/25 mb-6 mx-auto">
            <Sparkles className="w-6 h-6 text-aura-accent" />
          </div>
          <h2 className="font-display font-bold text-2xl md:text-3xl mb-4">
            Ready to <span className="text-gradient">analyse your site?</span>
          </h2>
          <p className="text-aura-muted text-sm mb-8">Start free. No credit card. Your first analysis in under 60 seconds.</p>
          <Link to={isAuthenticated ? '/app' : '/register'}>
            <button className="inline-flex items-center gap-2 bg-aura-accent hover:bg-aura-accent-dim text-white font-medium px-8 py-3 rounded-xl transition-all duration-150 shadow-glow-sm hover:shadow-glow text-sm">
              {isAuthenticated ? 'Open Aura' : 'Start for Free'} <ChevronRight className="w-4 h-4" />
            </button>
          </Link>
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 px-6 md:px-12 py-6 border-t border-white/[0.04] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-aura-accent" />
          <span className="text-xs text-aura-faint font-mono">Aura Design AI</span>
        </div>
        <p className="text-xs text-aura-faint">Built with LangGraph · Gemini · Pinecone · Supabase</p>
      </footer>

    </div>
  )
}
