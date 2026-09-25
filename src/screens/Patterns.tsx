import { useMemo } from 'react'
import { motion } from 'motion/react'
import { BatteryMedium, CalendarDays, Clock, LockKeyhole, Moon, Radar, Repeat2, Sparkles, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useData } from '../data'
import { DANGER, Eyebrow, GHOST, SectionLabel } from '../components/ui'
import { computeInsights, ENERGY_LABELS, sleepLabel, type Insight, type InsightKind } from '../lib/insights'
import { reasonCounts } from '../lib/stats'

const ICONS: Record<InsightKind, LucideIcon> = {
  reason: TriangleAlert,
  weekday: CalendarDays,
  domino: Radar,
  sleep: Moon,
  energy: BatteryMedium,
  late: Clock,
  recovery: Repeat2,
}

export function Patterns({ onOpenCheckin }: { onOpenCheckin: () => void }) {
  const { ix, habits, logs, misses, checkins } = useData()
  const insights = useMemo(() => computeInsights(ix, habits, logs, misses, checkins), [ix, habits, logs, misses, checkins])
  const ready = insights.filter((i) => i.ready)
  const lockedOnes = insights.filter((i) => !i.ready)
  const reasons = reasonCounts(misses)

  return (
    <div className="px-5 pt-[calc(env(safe-area-inset-top)+28px)]">
      <h1 className="font-display text-[64px] font-extrabold uppercase leading-[0.85] tracking-tight">Patterns</h1>
      <p className="mt-3 text-ink-2">What your own data says about you.</p>

      <CheckinCard onOpen={onOpenCheckin} />

      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
        <Sparkles size={18} className="shrink-0 text-ghost" aria-hidden />
        <p className="text-[14px] text-ink-2">
          <span className="font-semibold text-ink">
            {ready.length} of {insights.length}
          </span>{' '}
          findings unlocked. {lockedOnes.length ? 'The rest unlock as you keep logging.' : 'Everything is unlocked.'}
        </p>
      </div>

      {ready.length > 0 && (
        <>
          <SectionLabel>Findings</SectionLabel>
          <div className="space-y-3">
            {ready.map((i, n) => (
              <InsightCard key={i.kind} insight={i} delay={n * 0.05} />
            ))}
          </div>
        </>
      )}

      {lockedOnes.length > 0 && (
        <>
          <SectionLabel>Unlocking</SectionLabel>
          <div className="space-y-2">
            {lockedOnes.map((i) => (
              <LockedCard key={i.kind} insight={i} />
            ))}
          </div>
        </>
      )}

      {reasons.length > 0 && (
        <>
          <SectionLabel>What gets in the way</SectionLabel>
          <div className="space-y-2 rounded-[24px] border border-line bg-surface p-5">
            {reasons.map(([r, n]) => (
              <div key={r} className="flex items-center gap-3">
                <div className="w-32 shrink-0 truncate text-[14px] text-ink-2">{r}</div>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <motion.div
                    className="h-full rounded-full bg-danger/80"
                    initial={{ width: 0 }}
                    animate={{ width: `${(n / reasons[0][1]) * 100}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
                <div className="w-6 text-right font-display font-bold tabular-nums">{n}</div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="h-8" />
    </div>
  )
}

function CheckinCard({ onOpen }: { onOpen: () => void }) {
  const { today, checkins } = useData()
  const c = checkins.get(today)
  const done = c && !c.skipped
  return (
    <button onClick={onOpen} className="mt-6 flex w-full items-center gap-4 rounded-[24px] border border-line bg-surface p-4 text-left">
      <div className="grid size-12 shrink-0 place-items-center rounded-2xl" style={{ background: 'rgb(185 180 234 / .12)', color: GHOST }}>
        <Moon size={22} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-display text-lg font-bold uppercase leading-tight">{done ? 'Checked in tonight' : 'Evening check-in'}</div>
        <div className="truncate text-[13px] text-ink-3">
          {done
            ? [c.energy && `Energy ${c.energy} · ${ENERGY_LABELS[c.energy - 1]}`, c.sleep && `Slept ${sleepLabel(c.sleep)}`].filter(Boolean).join(' · ')
            : 'Two taps: energy and sleep. Powers the sleep and energy findings.'}
        </div>
      </div>
      <span className="shrink-0 text-sm font-semibold text-ink">{done ? 'Edit' : 'Start'}</span>
    </button>
  )
}

function InsightCard({ insight: i, delay }: { insight: Insight; delay: number }) {
  const Icon = ICONS[i.kind]
  const accent = i.habit?.color ?? GHOST
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="relative overflow-hidden rounded-[28px] border border-line bg-surface p-5"
    >
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-48 rounded-full opacity-[0.14] blur-3xl" style={{ background: accent }} />
      <div className="relative flex items-center gap-2" style={{ color: accent }}>
        <Icon size={16} aria-hidden />
        <Eyebrow style={{ color: accent }}>{i.title}</Eyebrow>
      </div>
      <div className="relative mt-2 font-display text-[44px] font-extrabold uppercase leading-[0.95] tracking-tight">{i.headline}</div>
      <p className="relative mt-2 text-[15px] leading-relaxed text-ink-2">{i.body}</p>
      {i.bars && <Bars bars={i.bars} accent={i.kind === 'reason' ? DANGER : accent} vertical={i.kind === 'weekday'} />}
      {i.basis && <div className="relative mt-3 text-[12px] text-ink-3">Based on {i.basis}</div>}
    </motion.article>
  )
}

function Bars({ bars, accent, vertical }: { bars: NonNullable<Insight['bars']>; accent: string; vertical?: boolean }) {
  if (vertical) {
    return (
      <div className="relative mt-4 flex h-24 items-end gap-2" role="img" aria-label={bars.map((b) => `${b.label} ${Math.round(b.value * 100)}%`).join(', ')}>
        {bars.map((b, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full flex-1 items-end">
              <motion.div
                className="w-full rounded-md"
                style={{ background: b.highlight ? accent : 'var(--color-surface-3)' }}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(4, b.value * 100)}%` }}
                transition={{ duration: 0.5, delay: i * 0.03 }}
              />
            </div>
            <span className={`text-[11px] font-semibold ${b.highlight ? 'text-ink' : 'text-ink-3'}`}>{b.label}</span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="relative mt-4 space-y-2">
      {bars.map((b) => (
        <div key={b.label}>
          <div className="flex justify-between text-[13px]">
            <span className={b.highlight ? 'text-ink' : 'text-ink-3'}>{b.label}</span>
            <span className="font-display font-bold tabular-nums">{Math.round(b.value * 100)}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3">
            <motion.div
              className="h-full rounded-full"
              style={{ background: b.highlight ? accent : 'var(--color-ink-3)' }}
              initial={{ width: 0 }}
              animate={{ width: `${b.value * 100}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function LockedCard({ insight: i }: { insight: Insight }) {
  const Icon = ICONS[i.kind]
  return (
    <div className="rounded-[22px] border border-line bg-surface px-4 py-4">
      <div className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-3">
          <Icon size={18} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-display text-[17px] font-bold uppercase leading-tight">
            {i.title} <LockKeyhole size={13} className="text-ink-3" aria-hidden />
          </div>
          <div className="text-[13px] text-ink-3">{i.needs} to unlock</div>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(i.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${i.title} progress`}>
        <div className="h-full rounded-full bg-ghost/70" style={{ width: `${i.progress * 100}%` }} />
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-3">{i.body}</p>
    </div>
  )
}
