import { User } from 'lucide-react'
import Badge from '../ui/Badge'

export default function PreferenceProfile({ profile }) {
  if (!profile) return (
    <div className="text-center py-6">
      <User className="w-7 h-7 text-aura-faint mx-auto mb-2" />
      <p className="text-xs text-aura-muted">Analyse sites to build your preference profile</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold text-aura-faint mb-2">Preferred Styles</p>
        <div className="flex flex-wrap gap-1.5">
          {profile.preferred_styles?.length > 0
            ? profile.preferred_styles.map(s => <Badge key={s} variant="accent">{s}</Badge>)
            : <span className="text-xs text-aura-faint">None yet</span>}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-aura-faint mb-2">Preferred Laws</p>
        <div className="flex flex-wrap gap-1.5">
          {profile.preferred_laws?.length > 0
            ? profile.preferred_laws.map(l => <Badge key={l} variant="default">{l}</Badge>)
            : <span className="text-xs text-aura-faint">None yet</span>}
        </div>
      </div>
      <div className="pt-2 border-t border-aura-line">
        <div className="flex justify-between text-[10px] font-mono">
          <span className="text-aura-faint">Fixes applied</span>
          <span className="text-aura-success">{profile.applied_fixes_count ?? 0}</span>
        </div>
        <div className="flex justify-between text-[10px] font-mono mt-1">
          <span className="text-aura-faint">Fixes dismissed</span>
          <span className="text-aura-muted">{profile.dismissed_fixes_count ?? 0}</span>
        </div>
      </div>
    </div>
  )
}
