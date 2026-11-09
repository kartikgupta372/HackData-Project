import { ExternalLink, TrendingUp } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import Badge from '../ui/Badge'

function ScoreBar({ label, value, color = 'bg-aura-accent' }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-aura-faint w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1 bg-aura-line rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${value ?? 0}%` }} />
      </div>
      <span className="text-xs font-semibold text-aura-muted w-7 text-right">{Math.round(value ?? 0)}</span>
    </div>
  )
}

export default function PageRankCard({ page }) {
  const host = (() => { try { return new URL(page.site_url).hostname } catch { return page.site_url } })()
  const composite = Math.round(page.composite_score ?? 0)
  const scoreColor = composite >= 75 ? 'text-aura-success' : composite >= 50 ? 'text-aura-warn' : 'text-aura-muted'

  return (
    <div className="p-4 rounded-xl bg-aura-card border border-aura-border hover:border-aura-accent/30 transition-all group">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-aura-text truncate">{host}</span>
            <a href={page.site_url} target="_blank" rel="noopener noreferrer"
              className="text-aura-faint hover:text-aura-accent opacity-0 group-hover:opacity-100 transition-all">
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <span className="text-xs font-mono text-aura-faint">{page.page_key}</span>
        </div>
        <div className="text-right shrink-0">
          <div className={`font-display font-bold text-xl ${scoreColor}`}>{composite}</div>
          <div className="text-[11px] text-aura-faint">composite</div>
        </div>
      </div>

      {/* Score breakdown */}
      <div className="flex flex-col gap-1.5 mb-3">
        <ScoreBar label="Design"      value={page.design_score}     color="bg-aura-accent" />
        <ScoreBar label="Heatmap"     value={page.heatmap_score}    color="bg-blue-400" />
        <ScoreBar label="Engagement"  value={page.engagement_score} color="bg-emerald-400" />
        <ScoreBar label="Improvement" value={page.improvement_delta} color="bg-yellow-400" />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-aura-line">
        <div className="flex items-center gap-1.5">
          {page.site_type && <Badge variant="default">{page.site_type}</Badge>}
          <span className="text-xs font-semibold text-aura-faint">{page.analysis_count ?? 0} analyses</span>
        </div>
        {page.last_analysed && (
          <span className="text-xs font-semibold text-aura-faint">
            {formatDistanceToNow(new Date(page.last_analysed), { addSuffix: true })}
          </span>
        )}
      </div>
    </div>
  )
}
