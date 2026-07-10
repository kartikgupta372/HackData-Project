import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { X, Eye, CheckCircle } from 'lucide-react'
import { heatmapApi } from '../../api/heatmap.api'
import { useAuthStore } from '../../store/authStore'
import Button from '../ui/Button'

export default function SurveyPanel({ siteUrl, pageKey, onClose }) {
  const { user } = useAuthStore()
  const [phase, setPhase] = useState('intro')
  const [countdown, setCountdown] = useState(30)
  const [events, setEvents] = useState([])
  const [submitted, setSubmitted] = useState(false)
  const startTimeRef = useRef(null)
  const containerRef = useRef(null)

  const startTracking = () => {
    setPhase('tracking')
    startTimeRef.current = Date.now()
    setEvents([])
    setCountdown(30)
  }

  useEffect(() => {
    if (phase !== 'tracking') return
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(timer); handleDone(); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [phase])

  const handleMouseMove = (e) => {
    if (phase !== 'tracking') return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top)  / rect.height
    const t = Date.now() - startTimeRef.current
    setEvents(prev => [...prev, { x: parseFloat(x.toFixed(4)), y: parseFloat(y.toFixed(4)), t }])
  }

  const handleDone = async () => {
    setPhase('done')
    if (events.length < 5) return
    setSubmitted(false)
    try {
      await heatmapApi.submitSurvey({
        siteUrl, pageKey,
        pageUrl: siteUrl + (pageKey === '/' ? '' : pageKey),
        userId: user?.id,
        deviceWidth: window.innerWidth,
        deviceHeight: window.innerHeight,
        webcamUsed: false,
        events,
      })
      setSubmitted(true)
    } catch (e) {
      console.error('Survey submit error:', e)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-aura-void/90 backdrop-blur-sm flex flex-col"
    >
      {}
      <div className="flex items-center justify-between px-6 py-4 border-b border-aura-line bg-aura-surface/80">
        <div className="flex items-center gap-3">
          <Eye className="w-4 h-4 text-aura-accent" />
          <span className="text-sm font-medium text-aura-text">Gaze Survey</span>
          <span className="text-xs text-aura-muted">— move your mouse as you would read this page</span>
        </div>
        <div className="flex items-center gap-3">
          {phase === 'tracking' && (
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-aura-error animate-pulse" />
              <span className="text-xs font-mono text-aura-error">{countdown}s remaining</span>
              <span className="text-xs font-mono text-aura-faint">· {events.length} points</span>
            </div>
          )}
          <button onClick={onClose} className="text-aura-faint hover:text-aura-text transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        ref={containerRef}
        className="flex-1 relative cursor-crosshair overflow-hidden"
        onMouseMove={handleMouseMove}
      >
        {phase === 'intro' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="pointer-events-auto text-center max-w-md p-8 rounded-2xl glass-card"
            >
              <Eye className="w-10 h-10 text-aura-accent mx-auto mb-4" />
              <h3 className="font-display font-bold text-lg text-aura-text mb-2">Ready to start?</h3>
              <p className="text-sm text-aura-muted mb-6">
                Move your mouse naturally as you read the page for 30 seconds. Your gaze pattern helps build the heatmap.
                <br /><br />
                <span className="text-aura-accent">First 3 seconds</span> are weighted 4× more than later gaze.
              </p>
              <Button onClick={startTracking} className="mx-auto">Start 30s Survey</Button>
            </motion.div>
          </div>
        )}

        {phase === 'tracking' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-aura-faint/30 text-4xl font-display font-bold select-none">
              Move your cursor naturally…
            </p>
          </div>
        )}

        {phase === 'done' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center max-w-sm p-8 rounded-2xl glass-card"
            >
              <CheckCircle className="w-10 h-10 text-aura-success mx-auto mb-4" />
              <h3 className="font-display font-bold text-lg text-aura-text mb-2">Survey Complete</h3>
              <p className="text-sm text-aura-muted mb-2">{events.length} gaze points recorded</p>
              {submitted && <p className="text-xs text-aura-success mb-4">✓ Saved to heatmap database</p>}
              <Button onClick={onClose} variant="outline" className="mx-auto">Close</Button>
            </motion.div>
          </div>
        )}

        {/* Visualize gaze points live during tracking */}
        {phase === 'tracking' && events.slice(-20).map((e, i) => (
          <div
            key={i}
            className="absolute w-3 h-3 rounded-full border border-aura-accent/40 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{
              left: `${e.x * 100}%`,
              top:  `${e.y * 100}%`,
              opacity: (i + 1) / 20 * 0.6,
              background: 'rgba(124,92,252,0.3)',
            }}
          />
        ))}
      </div>
    </motion.div>
  )
}
