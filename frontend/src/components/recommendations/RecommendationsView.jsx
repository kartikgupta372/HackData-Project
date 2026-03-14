import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Star, TrendingUp, User, ExternalLink } from 'lucide-react'
import { recommendationsApi } from '../../api/recommendations.api'
import PageRankCard from './PageRankCard'
import PreferenceProfile from './PreferenceProfile'
import Spinner from '../ui/Spinner'
import { useState } from 'react'

const SITE_TYPES = ['all','ecommerce','saas','portfolio','blog','restaurant','agency']

export default function RecommendationsView() {
  const [siteTypeFilter, setSiteTypeFilter] = useState('all')

  const { data: pages, isLoading: pagesLoading } = useQuery({
    queryKey: ['rec-pages', siteTypeFilter],
    queryFn: async () => {
      const res = await recommendationsApi.getPages({
        siteType: siteTypeFilter === 'all' ? undefined : siteTypeFilter,
        limit: 20,
      })
      return res.data.data
    },
    retry: 1,
  })

  const { data: profile } = useQuery({
    queryKey: ['rec-profile'],
    queryFn: async () => {
      const res = await recommendationsApi.getProfile()
      return res.data.data
    },
    retry: 1,
  })

  return (
    <div className="flex h-full bg-aura-void overflow-hidden">
      {/* Left panel */}
      <div className="w-72 border-r border-aura-line bg-aura-surface flex flex-col shrink-0 overflow-y-auto">
        <div className="p-4 border-b border-aura-line">
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-4 h-4 text-aura-accent" />
            <h2 className="font-display font-semibold text-sm text-aura-text">Recommendations</h2>
          </div>
          <p className="text-xs text-aura-muted">Personalized design insights based on your history</p>
        </div>
        <div className="p-4">
          <PreferenceProfile profile={profile} />
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Filter bar */}
        <div className="flex items-center gap-1.5 mb-6 flex-wrap">
          {SITE_TYPES.map(t => (
            <button
              key={t}
              onClick={() => setSiteTypeFilter(t)}
              className={`text-xs px-3 py-1.5 rounded-md font-mono transition-all capitalize ${
                siteTypeFilter === t
                  ? 'bg-aura-accent/15 text-aura-accent border border-aura-accent/25'
                  : 'bg-aura-card border border-aura-border text-aura-muted hover:text-aura-text'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {pagesLoading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" className="text-aura-accent" /></div>
        ) : !pages?.length ? (
          <EmptyRecs />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {pages.map((page, i) => (
              <motion.div
                key={`${page.site_url}-${page.page_key}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
              >
                <PageRankCard page={page} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyRecs() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-aura-card border border-aura-border flex items-center justify-center mx-auto mb-4">
        <TrendingUp className="w-6 h-6 text-aura-faint" />
      </div>
      <p className="text-sm font-medium text-aura-text mb-1">No ranked pages yet</p>
      <p className="text-xs text-aura-muted max-w-xs">
        Analyse websites using the Chatbot feature to start building your ranking database.
      </p>
    </div>
  )
}
