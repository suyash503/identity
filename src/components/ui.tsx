import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'motion/react'
import { Braces, Dumbbell, Flame, GitCommitHorizontal, Link2, type LucideIcon } from 'lucide-react'
import type { Habit, IconKey } from '../db'
import { addDays, rangeKeys } from '../lib/day'
import { statusOf, type DayStatus, type Index } from '../lib/stats'

export const DANGER = '#ff3b5c'
export const GHOST = '#b9b4ea'

/** Translucent version of a color, for tints and glows. */
export const tint = (color: string, pct: number) => `color-mix(in oklab, ${color} ${pct}%, transparent)`

const ICONS: Record<IconKey, LucideIcon> = { gym: Dumbbell, dsa: Braces, git: GitCommitHorizontal, torch: Flame }

export function HabitIcon({ habit, size = 20, className }: { habit: Habit; size?: number; className?: string }) {
  const Icon = ICONS[habit.icon]
  return <Icon size={size} strokeWidth={2.25} aria-hidden className={className} />
}

export function IconTile({ habit, size = 48 }: { habit: Habit; size?: number }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-2xl"
      style={{ width: size, height: size, background: tint(habit.color, 16), color: habit.color }}
    >
      <HabitIcon habit={habit} size={Math.round(size * 0.46)} />
    </div>
  )
}

export function Eyebrow({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`font-display text-[12px] font-semibold uppercase tracking-[0.22em] text-ink-3 ${className}`} style={style}>
      {children}
    </div>
  )
}

export function SectionLabel({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div className="mb-3 mt-9 flex items-center gap-3">
      <Eyebrow style={color ? { color } : undefined}>{children}</Eyebrow>
      <div className="h-px flex-1 bg-line" />
    </div>
  )
}

export function ChainBadge({ links, cracks, compact }: { links: number; cracks: number; compact?: boolean }) {
  return (
    <div className="flex shrink-0 flex-col items-end" aria-label={`Chain of ${links} days, ${cracks} cracks`}>
      <div className="flex items-center gap-1 font-display text-2xl font-bold leading-none tabular-nums">
        <Link2 size={16} strokeWidth={2.5} aria-hidden className="text-ink-3" />
        {links}
      </div>
      {!compact && (
        <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-3">
          {cracks > 0 ? `${cracks} crack${cracks > 1 ? 's' : ''}` : 'chain'}
        </div>
      )}
    </div>
  )
}

export function statusStyle(status: DayStatus, color: string): CSSProperties {
  switch (status) {
    case 'full':
      return { background: color, boxShadow: `0 0 10px -2px ${tint(color, 80)}` }
    case 'min':
      return { background: tint(color, 50) }
    case 'missed':
      return { background: tint(DANGER, 22) }
    case 'pending':
      return { boxShadow: `inset 0 0 0 1.5px ${tint(color, 70)}` }
    default:
      return { background: 'var(--color-surface-3)', opacity: 0.5 }
  }
}

export function DayDots({ ix, habit, days = 14 }: { ix: Index; habit: Habit; days?: number }) {
  return (
    <div className="flex gap-[5px]" aria-label={`Last ${days} days`}>
      {rangeKeys(addDays(ix.today, -(days - 1)), ix.today).map((d) => (
        <div key={d} className="size-[10px] rounded-[3px]" style={statusStyle(statusOf(ix, habit.id, d), habit.color)} />
      ))}
    </div>
  )
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  id,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  id: string
}) {
  return (
    <div role="tablist" className="flex rounded-full border border-line bg-surface p-1">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`relative h-10 flex-1 rounded-full font-display text-sm font-semibold uppercase tracking-[0.14em] transition-colors ${active ? 'text-black' : 'text-ink-2'}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-ink"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Full-screen layer used by the ritual flow, settings and the photo viewer. */
export function Overlay({ children, onClose, label }: { children: ReactNode; onClose?: () => void; label: string }) {
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 overflow-y-auto bg-bg"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      onKeyDown={(e) => e.key === 'Escape' && onClose?.()}
    >
      <div className="mx-auto min-h-dvh max-w-md px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+12px)]">
        {children}
      </div>
    </motion.div>
  )
}

export function Sheet({ children, label, onClose }: { children: ReactNode; label: string; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative w-full max-w-md rounded-t-[32px] border-t border-line bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 420, damping: 40 }}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-surface-3" />
        {children}
      </motion.div>
    </motion.div>
  )
}

/** Level badge shown on sealed habits. */
export function LevelBadge({ level, color }: { level: 'min' | 'full'; color: string }) {
  return level === 'full' ? (
    <span className="rounded-full px-3 py-1 font-display text-xs font-bold uppercase tracking-[0.18em] text-black" style={{ background: color }}>
      Full
    </span>
  ) : (
    <span
      className="rounded-full px-3 py-1 font-display text-xs font-bold uppercase tracking-[0.18em]"
      style={{ color, boxShadow: `inset 0 0 0 1.5px ${tint(color, 70)}`, background: 'rgb(0 0 0 / .45)' }}
    >
      Minimum
    </span>
  )
}

/** Stand-in artwork for seals without a photo (GitHub auto-seals). */
export function CommitPattern({ color }: { color: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-surface" aria-hidden>
      <div
        className="absolute inset-0 grid grid-cols-[repeat(18,1fr)] gap-1 p-3 opacity-70"
        style={{ transform: 'rotate(-8deg) scale(1.3)' }}
      >
        {Array.from({ length: 18 * 8 }, (_, i) => {
          const v = (Math.sin(i * 12.9898) * 43758.5453) % 1
          const a = Math.abs(v)
          return <div key={i} className="aspect-square rounded-[3px]" style={{ background: a > 0.55 ? tint(color, 20 + a * 60) : 'var(--color-surface-3)' }} />
        })}
      </div>
    </div>
  )
}

export function RivalAvatar({ size = 44 }: { size?: number }) {
  return (
    <div
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-display font-extrabold leading-none text-black"
      style={{ width: size, height: size, fontSize: size * 0.52, background: 'linear-gradient(135deg, #f5c2ff, #d946ef 55%, #7c3aed)' }}
    >
      A
    </div>
  )
}
