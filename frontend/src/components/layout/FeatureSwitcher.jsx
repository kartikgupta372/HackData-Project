import { motion } from 'framer-motion'
import { MessageSquare, Activity, Star, Lightbulb } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { clsx } from 'clsx'

// Each tool owns a signature colour (see .theme-app in index.css). The dot and the
// active underline use it, so people always know which tool they are in.
const FEATURES = [
  { id: 'chat',            label: 'Chatbot',         hint: 'Ask and audit',        icon: MessageSquare, dot: 'bg-[#7C8CFF]' },
  { id: 'heatmap',         label: 'Heatmap Studio',  hint: 'See where users look', icon: Activity,      dot: 'bg-[#FF6F61]' },
  { id: 'insights',        label: 'Insights',        hint: 'What to fix first',    icon: Lightbulb,     dot: 'bg-[#2DD4BF]' },
  { id: 'recommendations', label: 'Recommendations', hint: 'Ranked page fixes',    icon: Star,          dot: 'bg-[#FFB020]' },
]

export default function FeatureSwitcher() {
  const { activeFeature, setActiveFeature: setFeature } = useUIStore()

  return (
    <nav aria-label="Tools" className="h-14 border-b border-aura-line bg-aura-surface flex items-stretch px-3 gap-1 shrink-0 overflow-x-auto">
      {FEATURES.map(f => {
        const Icon = f.icon
        const active = activeFeature === f.id
        return (
          <button
            key={f.id}
            onClick={() => setFeature(f.id)}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'relative flex items-center gap-2.5 px-4 text-sm transition-colors duration-150 shrink-0',
              active ? 'text-aura-text' : 'text-aura-muted hover:text-aura-text'
            )}
          >
            <span className={clsx('flex items-center justify-center w-7 h-7 rounded-lg transition-colors', active ? 'bg-aura-accent text-aura-on-accent' : 'bg-aura-elevated text-aura-muted')}>
              <Icon className="w-3.5 h-3.5" />
            </span>
            <span className="flex flex-col items-start leading-tight">
              <span className={clsx('font-semibold', active && 'font-display')}>{f.label}</span>
              <span className="text-[11px] text-aura-faint hidden lg:block">{f.hint}</span>
            </span>
            {active && (
              <motion.span
                layoutId="feature-underline"
                className="absolute left-3 right-3 bottom-0 h-[3px] rounded-t-full bg-aura-accent"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
          </button>
        )
      })}
    </nav>
  )
}
