// src/pages/SurveyPage.jsx
// Public page — survey participants click on screenshot to record attention
import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MousePointer2, CheckCircle2, Loader2, AlertCircle, X } from 'lucide-react'
import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || ''

export default function SurveyPage() {
  const { token } = useParams()
  const [survey, setSurvey]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [clicks, setClicks]       = useState([])  // [{x_pct, y_pct, timestamp_ms, click_order}]
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const imgRef = useRef(null)
  const startTime = useRef(Date.now())
  const MAX_CLICKS = 10

  useEffect(() => {
    axios.get(`${BASE}/heatmap/survey/${token}`)
      .then(r => setSurvey(r.data.data))
      .catch(e => setError(e.response?.data?.error ?? 'Survey not found or expired'))
      .finally(() => setLoading(false))
  }, [token])

  const handleImgClick = useCallback((e) => {
    if (clicks.length >= MAX_CLICKS || submitted) return
    const rect = imgRef.current.getBoundingClientRect()
    const x_pct = (e.clientX - rect.left) / rect.width
    const y_pct = (e.clientY - rect.top) / rect.height
    const timestamp_ms = Date.now() - startTime.current
    const newClick = { x_pct: parseFloat(x_pct.toFixed(4)), y_pct: parseFloat(y_pct.toFixed(4)), timestamp_ms, click_order: clicks.length + 1 }
    setClicks(prev => [...prev, newClick])
  }, [clicks, submitted])

  const handleUndo = () => setClicks(prev => prev.slice(0, -1))

  const handleSubmit = async () => {
    if (!clicks.length) return
    setSubmitting(true); setSubmitError('')
    try {
      await axios.post(`${BASE}/heatmap/survey/${token}/submit`, {
        clicks,
        deviceType: window.innerWidth < 768 ? 'mobile' : 'desktop',
      })
      setSubmitted(true)
    } catch (e) {
      setSubmitError(e.response?.data?.error ?? 'Submission failed. Please try again.')
    } finally { setSubmitting(false) }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-white font-semibold text-lg mb-2">Survey Unavailable</h2>
        <p className="text-gray-400 text-sm">{error}</p>
      </div>
    </div>
  )

  if (submitted) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="text-center max-w-sm">
        <div className="w-20 h-20 rounded-full bg-green-500/15 border-2 border-green-500/40 flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 className="w-10 h-10 text-green-400" />
        </div>
        <h2 className="text-white font-bold text-2xl mb-2">Thank you!</h2>
        <p className="text-gray-400 text-sm">Your {clicks.length} click{clicks.length !== 1 ? 's' : ''} have been recorded. This helps improve the website design.</p>
      </motion.div>
    </div>
  )

  const screenshotUrl = survey.screenshot_url?.startsWith('http')
    ? survey.screenshot_url
    : `${BASE || 'http://localhost:3002'}${survey.screenshot_url}`

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gray-950/95 backdrop-blur border-b border-white/10 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-sm text-white truncate">{survey.title}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{survey.instructions}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex gap-1">
              {Array.from({ length: MAX_CLICKS }).map((_, i) => (
                <div key={i} className={`w-2.5 h-2.5 rounded-full border ${i < clicks.length ? 'bg-purple-500 border-purple-400' : 'bg-transparent border-gray-600'}`} />
              ))}
            </div>
            <span className="text-xs text-gray-400">{clicks.length}/{MAX_CLICKS}</span>
          </div>
        </div>
      </div>

      {/* Screenshot with click tracking */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="mb-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-start gap-2">
          <MousePointer2 className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
          <p className="text-xs text-purple-300 leading-relaxed">
            Click on the areas that <strong>catch your attention first</strong>. You can add up to {MAX_CLICKS} clicks. Click a dot to undo it.
          </p>
        </div>

        <div className="relative rounded-xl overflow-hidden border border-white/10 cursor-crosshair select-none bg-gray-900"
          onClick={handleImgClick}>
          <img ref={imgRef} src={screenshotUrl} alt="Website page"
            className="w-full h-auto block" draggable={false}
            style={{ pointerEvents: 'none' }} />

          {/* Click dots overlay */}
          {clicks.map((c, i) => (
            <motion.button
              key={i}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => { e.stopPropagation(); setClicks(prev => prev.filter((_, idx) => idx !== i).map((c, j) => ({ ...c, click_order: j + 1 }))) }}
              className="absolute flex items-center justify-center"
              style={{
                left: `calc(${c.x_pct * 100}% - 14px)`,
                top:  `calc(${c.y_pct * 100}% - 14px)`,
                width: 28, height: 28,
                borderRadius: '50%',
                background: i === 0 ? 'rgba(239,68,68,0.85)' : i === 1 ? 'rgba(249,115,22,0.85)' : i === 2 ? 'rgba(234,179,8,0.85)' : 'rgba(168,85,247,0.85)',
                border: '2px solid white',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                cursor: 'pointer',
                zIndex: 10,
              }}
              title="Click to remove"
            >
              <span className="text-white font-bold text-xs">{i + 1}</span>
            </motion.button>
          ))}

          {/* Click count warning */}
          {clicks.length >= MAX_CLICKS && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-3 py-1.5 rounded-full border border-white/20">
              Max clicks reached — click a dot to remove it
            </div>
          )}
        </div>

        {/* Submit area */}
        <div className="mt-5 flex items-center justify-between gap-4">
          <button onClick={handleUndo} disabled={!clicks.length}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-30 transition-colors px-3 py-2 rounded-lg border border-white/10 hover:border-white/20">
            <X className="w-3.5 h-3.5" /> Undo last
          </button>
          <div className="flex items-center gap-3">
            {submitError && <p className="text-xs text-red-400">{submitError}</p>}
            <button onClick={handleSubmit} disabled={!clicks.length || submitting}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-medium text-sm px-6 py-2.5 rounded-lg transition-all">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {submitting ? 'Submitting…' : `Submit ${clicks.length} click${clicks.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-gray-600">Your responses are anonymous and used only to improve this website.</p>
      </div>
    </div>
  )
}
