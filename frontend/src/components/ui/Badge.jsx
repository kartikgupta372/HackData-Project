import { clsx } from 'clsx'

const variants = {
  default: 'bg-aura-elevated text-aura-muted border-aura-border',
  accent:  'bg-aura-accent/15 text-aura-accent-glow border-aura-accent/35',
  success: 'bg-aura-success/12 text-aura-success border-aura-success/30',
  warn:    'bg-aura-warn/12 text-aura-warn border-aura-warn/30',
  error:   'bg-aura-error/12 text-aura-error border-aura-error/30',
}

export default function Badge({ variant = 'default', className, children }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border',
      variants[variant], className
    )}>
      {children}
    </span>
  )
}
