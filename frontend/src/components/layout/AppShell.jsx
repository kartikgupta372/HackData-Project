import Sidebar from './Sidebar'
import FeatureSwitcher from './FeatureSwitcher'
import { useUIStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import ChatView from '../chat/ChatView'
import HeatmapView from '../heatmap/HeatmapView'
import InsightsView from '../insights/InsightsView'
import RecommendationsView from '../recommendations/RecommendationsView'
import OnboardingForm from '../onboarding/OnboardingForm'
import { motion, AnimatePresence } from 'framer-motion'

const FEATURES = {
  chat:            ChatView,
  heatmap:         HeatmapView,
  insights:        InsightsView,
  recommendations: RecommendationsView,
}

export default function AppShell() {
  const { activeFeature } = useUIStore()
  const { onboardingCompleted, setOnboardingCompleted } = useAuthStore()
  const FeatureView = FEATURES[activeFeature] || ChatView

  const handleOnboardingComplete = (data) => {
    setOnboardingCompleted(data)
  }

  return (
    <div data-feature={activeFeature} className="theme-app flex h-screen bg-aura-void text-aura-text overflow-hidden font-body">
      <Sidebar />

      <main className="flex flex-col flex-1 min-w-0 relative z-10 bg-aura-base">
        <FeatureSwitcher />
        <AnimatePresence mode="wait">
          <motion.div
            key={activeFeature}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1 min-h-0"
          >
            <FeatureView />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Onboarding overlay for first-time users */}
      {!onboardingCompleted && (
        <OnboardingForm onComplete={handleOnboardingComplete} />
      )}
    </div>
  )
}
