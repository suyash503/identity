import { useMemo } from 'react'
import { ChevronLeft, Clock, Link2, Trophy } from 'lucide-react'
import type { Habit } from '../db'
import { useData } from '../data'
import { habitHistory, logOf, statusOf, type Index } from '../lib/stats'
import { addDays, fmtDay, fmtMinute, keyFromDate, minutesInto, parseKey, relativeDay, weekdayIndex, type DayKey } from '../lib/day'
import { Eyebrow, HabitIcon, LevelBadge, Overlay, SectionLabel, statusStyle, tint } from './ui'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const WEEKDAY_NAMES = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']

/** Everything one habit has ever been: counts, chains, a calendar, and the latest seals. */
export function HabitHistory({
  habit,
  canLog,
  onLogDay,
  onClose,
}: {
  habit: Habit
  /** Days that can still be sealed late; tapping one in the calendar opens it. */
  canLog: (d: DayKey) => boolean
  onLogDay: (d: DayKey) => void
  onClose: () => void
}) {
  const { ix, misses } = useData()
  const h = useMemo(() => habitHistory(ix, habit.id, misses), [ix, habit.id, misses])
  const recent = useMemo(() => {
    const out = []
    for (let d = ix.today; d >= ix.startDay && out.length < 12; d = addDays(d, -1)) {
      const log = logOf(ix, habit.id, d)
      if (log) out.push(log)
    }
    return out
  }, [ix, habit.id])

  const rated = h.weekdays.map((r, i) => ({ r, i })).filter((x): x is { r: number; i: number } => x.r !== null)
  const best = rated.length >= 7 ? rated.reduce((a, b) => (b.r > a.r ? b : a)) : undefined
  const worst = rated.length >= 7 ? rated.reduce((a, b) => (b.r < a.r ? b : a)) : undefined

  return (
    <Overlay label={`${habit.name} history`} onClose={onClose}>
      <div className="flex h-12 items-center justify-between">
        <button onClick={onClose} aria-label="Back" className="-ml-2 grid size-11 place-items-center rounded-pill text-ink-2 active:bg-surface-2">
          <ChevronLeft size={26} />
        </button>
        <Eyebrow>History</Eyebrow>
        <div className="size-11" />
      </div>

      <div className="mt-4 flex items-center gap-2" style={{ color: habit.color }}>
        <HabitIcon habit={habit} size={22} />
        <span className="font-display text-lg font-bold uppercase tracking-[0.2em]">{habit.name}</span>
      </div>
      <div className="mt-2 flex items-end gap-3">
        <span className="font-display text-[88px] font-extrabold leading-[0.8] tabular-nums">{h.kept}</span>
        <span className="pb-1 text-[15px] leading-tight text-ink-2">
          times done
          <br />
          in {h.days} day{h.days === 1 ? '' : 's'}
        </span>
      </div>
      <p className="mt-3 text-[14px] text-ink-3">{habit.identity}</p>

      <div className="mt-6 grid grid-cols-3 gap-2">
        <Stat label="Hit rate" value={`${Math.round(h.rate * 100)}%`} />
        <Stat label="Full" value={h.full} color={habit.color} />
        <Stat label="Minimum" value={h.min} />
        <Stat label="Chain now" value={h.chain.links} icon={<Link2 size={15} aria-hidden />} />
        <Stat label="Longest" value={h.longest} icon={<Trophy size={15} aria-hidden />} />
        <Stat label="Missed" value={h.missed} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="This month" value={h.thisMonth} />
        <Stat label="Usually at" value={h.usualMinute === undefined ? '—' : fmtMinute(h.usualMinute)} icon={<Clock size={15} aria-hidden />} small />
      </div>

      <SectionLabel>Calendar</SectionLabel>
      <Calendar ix={ix} habit={habit} canLog={canLog} onLogDay={onLogDay} />
      <p className="mt-3 text-center text-[12px] text-ink-3">Tap an empty day from this week to log it.</p>

      {rated.length > 0 && (
        <>
          <SectionLabel>By weekday</SectionLabel>
          <div className="grid grid-cols-7 gap-1.5">
            {h.weekdays.map((r, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="relative h-20 w-full overflow-hidden rounded-lg bg-surface-2">
                  <div className="absolute inset-x-0 bottom-0 rounded-lg" style={{ height: `${(r ?? 0) * 100}%`, background: tint(habit.color, 70) }} />
                </div>
                <span className="text-[11px] text-ink-3">{WEEKDAYS[i]}</span>
              </div>
            ))}
          </div>
          {best && worst && best.i !== worst.i && (
            <p className="mt-3 text-[14px] text-ink-2">
              Strongest on <span className="text-ink">{WEEKDAY_NAMES[best.i]}</span> ({Math.round(best.r * 100)}%), weakest on{' '}
              <span className="text-ink">{WEEKDAY_NAMES[worst.i]}</span> ({Math.round(worst.r * 100)}%).
            </p>
          )}
        </>
      )}

      {h.reasons.length > 0 && (
        <>
          <SectionLabel>What gets in the way</SectionLabel>
          <div className="space-y-2">
            {h.reasons.slice(0, 4).map(([reason, n]) => (
              <div key={reason} className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3">
                <span className="text-[15px]">{reason}</span>
                <span className="font-display text-lg font-bold tabular-nums text-ink-2">×{n}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionLabel>Latest seals</SectionLabel>
      {recent.length === 0 ? (
        <p className="text-[14px] text-ink-3">Nothing sealed yet.</p>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {recent.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[15px]">{relativeDay(l.day, ix.today)}</div>
                <div className="truncate text-[13px] text-ink-3">
                  {l.source === 'github' ? 'GitHub push' : fmtMinute(minutesInto(l.day, l.at))}
                  {l.caption ? ` · “${l.caption}”` : ''}
                </div>
              </div>
              <LevelBadge level={l.level} color={habit.color} />
            </div>
          ))}
        </div>
      )}
      {h.firstDay && (
        <p className="mb-2 mt-6 text-center text-[12px] text-ink-3">First sealed {fmtDay(h.firstDay, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      )}
    </Overlay>
  )
}

function Stat({
  label,
  value,
  icon,
  color,
  small,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
  color?: string
  small?: boolean
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-3">
      <div
        className={`flex items-center gap-1.5 font-display font-bold leading-none tabular-nums ${small ? 'text-[22px]' : 'text-[28px]'}`}
        style={{ color }}
      >
        {icon && <span className="text-ink-3">{icon}</span>}
        {value}
      </div>
      <div className="mt-1.5 text-[11px] uppercase tracking-[0.14em] text-ink-3">{label}</div>
    </div>
  )
}

/** One grid per month, newest first, Monday-first weeks. */
function Calendar({ ix, habit, canLog, onLogDay }: { ix: Index; habit: Habit; canLog: (d: DayKey) => boolean; onLogDay: (d: DayKey) => void }) {
  const months: DayKey[] = []
  for (let m = ix.today.slice(0, 7) + '-01'; m >= ix.startDay.slice(0, 7) + '-01'; ) {
    months.push(m)
    const d = parseKey(m)
    d.setMonth(d.getMonth() - 1)
    m = keyFromDate(d)
  }
  return (
    <div className="space-y-5">
      {months.map((first) => {
        const d = parseKey(first)
        const daysIn = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
        const cells = Array.from({ length: daysIn }, (_, i) => addDays(first, i))
        return (
          <div key={first}>
            <div className="mb-2 text-[13px] text-ink-2">{fmtDay(first, { month: 'long', year: 'numeric' })}</div>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: weekdayIndex(first) }, (_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {cells.map((day) => {
                const s = statusOf(ix, habit.id, day)
                const tappable = canLog(day) && (s === 'missed' || s === 'pending')
                const style = statusStyle(s, habit.color)
                const label = `${fmtDay(day, { day: 'numeric', month: 'short' })}: ${s === 'none' ? 'not started' : s === 'min' ? 'minimum' : s}`
                return tappable ? (
                  <button
                    key={day}
                    onClick={() => onLogDay(day)}
                    aria-label={`${label}, log it`}
                    className="grid aspect-square place-items-center rounded-md text-[11px] tabular-nums text-ink"
                    style={{ ...style, boxShadow: `inset 0 0 0 1.5px ${tint(habit.color, 70)}` }}
                  >
                    {Number(day.slice(8))}
                  </button>
                ) : (
                  <div key={day} aria-label={label} className="grid aspect-square place-items-center rounded-md text-[11px] tabular-nums" style={{ ...style, color: s === 'full' ? '#000' : 'var(--color-ink-3)' }}>
                    {Number(day.slice(8))}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
