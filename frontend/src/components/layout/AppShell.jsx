import Sidebar from './Sidebar'
import FeatureSwitcher from './FeatureSwitcher'
import { useUIStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import ChatView from '../chat/ChatView'
import HeatmapView from '../heatmap/HeatmapView'
import RecommendationsView from '../recommendations/RecommendationsView'
import OnboardingForm from '../onboarding/OnboardingForm'
import { motion, AnimatePresence } from 'framer-motion'

const FEATURES = {
  chat:            ChatView,
  heatmap:         HeatmapView,
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
    <div className="flex h-screen bg-aura-void overflow-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-64 w-96 h-96 bg-aura-accent/[0.03] rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-aura-accent/[0.02] rounded-full blur-3xl" />
      </div>

      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 relative z-10 transition-all duration-300">
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
      </div>

      {/* Onboarding overlay for first-time users */}
      {!onboardingCompleted && (
        <OnboardingForm onComplete={handleOnboardingComplete} />
      )}
    </div>
  )
}
