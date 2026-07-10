import { useState } from 'react'
import { motion } from 'framer-motion'

const GRID_COLS = 20
const GRID_ROWS = 20

function scoreToColor(score, alpha = 1) {
  if (score <= 0) return `rgba(0,0,0,0)`
  if (score < 30)  return `rgba(59,130,246,${(score/30)*alpha*0.7})`
  if (score < 60)  return `rgba(34,197,94,${((score-30)/30)*alpha*0.8})`
  if (score < 80)  return `rgba(251,191,36,${((score-60)/20)*alpha*0.9})`
  return `rgba(239,68,68,${Math.min(1,((score-80)/20)*alpha+0.6)})`
}

export default function HeatmapGrid({ data, siteUrl }) {
  const [view, setView] = useState('full')
  const grid = data?.grid_data
  const hotZones = data?.hot_zones ?? []
  const aboveFold = data?.above_fold_pct
  const predicted = data?.predicted

  return (
    <div className="flex-1 flex flex-col p-6 overflow-auto">
      {}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display font-semibold text-aura-text text-sm">{siteUrl}</h3>
          <p className="text-xs text-aura-muted mt-0.5">
            {predicted ? 'AI-predicted attention zones' : `${data?.session_count ?? 0} survey sessions · time-weighted`}
          </p>
        </div>
        <div className="flex gap-1 p-0.5 bg-aura-card rounded-lg border border-aura-border">
          {['full','first3s'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-xs px-3 py-1.5 rounded-md transition-all ${view===v ? 'bg-aura-accent/15 text-aura-accent border border-aura-accent/25' : 'text-aura-muted hover:text-aura-text'}`}
            >
              {v === 'full' ? 'Full session' : 'First 3s (4× weight)'}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {grid ? (
        <div className="relative rounded-xl overflow-hidden bg-aura-card border border-aura-border" style={{ aspectRatio:'16/9', maxHeight: 480 }}>
          {/* Heat overlay */}
          <div
            className="absolute inset-0 z-10"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
              gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
            }}
          >
            {grid.flat().map((score, i) => (
              <div
                key={i}
                style={{ background: scoreToColor(score, 0.75) }}
                title={`score: ${score}`}
              />
            ))}
          </div>

          {/* Hot zone overlays */}
          {hotZones.map((z, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="absolute z-20 border-2 border-aura-accent/60 rounded-lg"
              style={{
                left:   `${z.x * 100}%`,
                top:    `${z.y * 100}%`,
                width:  `${Math.max(z.w, 0.08) * 100}%`,
                height: `${Math.max(z.h, 0.08) * 100}%`,
                background: 'rgba(124,92,252,0.08)',
                boxShadow: '0 0 12px rgba(124,92,252,0.3)',
              }}
            >
              <span className="absolute -top-5 left-0 text-[9px] font-mono text-aura-accent bg-aura-void/80 px-1.5 py-0.5 rounded whitespace-nowrap">
                #{i+1} {z.score}/100
              </span>
            </motion.div>
          ))}

          {/* Fold line */}
          <div className="absolute z-20 w-full border-t border-dashed border-yellow-400/40" style={{ top: '55%' }}>
            <span className="absolute right-2 -top-4 text-[9px] font-mono text-yellow-400/60">fold</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center rounded-xl bg-aura-card border border-aura-border" style={{minHeight:300}}>
          <p className="text-sm text-aura-muted">No grid data available</p>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-6 mt-4">
        <div className="flex items-center gap-2">
          {['Low','Mid','High','Peak'].map((l,i) => (
            <div key={l} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{background: ['rgba(59,130,246,0.6)','rgba(34,197,94,0.7)','rgba(251,191,36,0.8)','rgba(239,68,68,0.9)'][i]}} />
              <span className="text-[10px] font-mono text-aura-faint">{l}</span>
            </div>
          ))}
        </div>
        {aboveFold != null && (
          <span className="text-[10px] font-mono text-aura-muted ml-auto">
            {aboveFold}% attention above fold
          </span>
        )}
      </div>
    </div>
  )
}
