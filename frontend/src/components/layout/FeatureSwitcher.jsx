import { motion } from 'framer-motion'
import { MessageSquare, Activity, Star, Lightbulb } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { clsx } from 'clsx'

const FEATURES = [
  { id: 'chat',            label: 'Chatbot',         icon: MessageSquare },
  { id: 'heatmap',         label: 'Heatmap Studio',  icon: Activity },
  { id: 'insights',        label: 'Insights',        icon: Lightbulb },
  { id: 'recommendations', label: 'Recommendations', icon: Star },
]

export default function FeatureSwitcher() {
  const { activeFeature, setActiveFeature: setFeature } = useUIStore()

  return (
    <div className="h-14 border-b border-aura-line bg-aura-surface/80 backdrop-blur-sm flex items-center px-4 gap-1 shrink-0">
      {FEATURES.map(f => {
        const Icon = f.icon
        const active = activeFeature === f.id
        return (
          <button
            key={f.id}
            onClick={() => setFeature(f.id)}
            className={clsx(
              'relative flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all duration-150',
              active ? 'text-aura-text' : 'text-aura-muted hover:text-aura-text'
            )}
          >
            {active && (
              <motion.div
                layoutId="feature-pill"
                className="absolute inset-0 bg-aura-accent/10 border border-aura-accent/25 rounded-md"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <Icon className={clsx('w-3.5 h-3.5 relative z-10 shrink-0', active && 'text-aura-accent')} />
            <span className="relative z-10">{f.label}</span>
          </button>
        )
      })}
    </div>
  )
}
