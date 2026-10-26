import type { Habit, Log, Miss } from '../db'
import { addDays, diffDays, minutesInto, rangeKeys, weekdayIndex, type DayKey } from './day'

export type DayStatus = 'full' | 'min' | 'missed' | 'pending' | 'none'
export type Alert = 'none' | 'danger' | 'broken'

export interface Index {
  logs: Map<string, Log>
  startDay: DayKey
  today: DayKey
}

const key = (habitId: string, day: DayKey) => `${habitId}|${day}`

export function buildIndex(logs: Log[], startDay: DayKey, today: DayKey): Index {
  return { logs: new Map(logs.map((l) => [key(l.habitId, l.day), l])), startDay, today }
}

export function logOf(ix: Index, habitId: string, day: DayKey): Log | undefined {
  return ix.logs.get(key(habitId, day))
}

export function statusOf(ix: Index, habitId: string, day: DayKey): DayStatus {
  if (day < ix.startDay || day > ix.today) return 'none'
  const log = logOf(ix, habitId, day)
  if (log) return log.level
  return day === ix.today ? 'pending' : 'missed'
}

export const isKept = (s: DayStatus) => s === 'full' || s === 'min'

export function dayNumber(ix: Index): number {
  return diffDays(ix.today, ix.startDay) + 1
}

/** Consecutive misses ending yesterday. */
export function missRun(ix: Index, habitId: string): number {
  let n = 0
  for (let d = addDays(ix.today, -1); d >= ix.startDay && statusOf(ix, habitId, d) === 'missed'; d = addDays(d, -1)) n++
  return n
}

/** Never miss twice: one miss → danger day, two or more → broken. */
export function alertOf(ix: Index, habitId: string): Alert {
  if (isKept(statusOf(ix, habitId, ix.today))) return 'none'
  const run = missRun(ix, habitId)
  return run === 0 ? 'none' : run === 1 ? 'danger' : 'broken'
}

/**
 * The chain survives single misses (cracks) and only breaks on two misses in a row.
 * links = kept days since the last break.
 */
export function chainOf(ix: Index, habitId: string): { links: number; cracks: number } {
  let links = 0
  let cracks = 0
  let prevMissed = false
  for (let d = ix.today; d >= ix.startDay; d = addDays(d, -1)) {
    const s = statusOf(ix, habitId, d)
    if (isKept(s)) {
      links++
      prevMissed = false
    } else if (s === 'missed') {
      if (prevMissed) {
        cracks-- // the miss we counted as a crack was really half of the break
        break
      }
      cracks++
      prevMissed = true
    }
  }
  return { links, cracks: Math.max(0, cracks) }
}

export function longestChain(ix: Index, habitId: string): number {
  let best = 0
  let cur = 0
  let prevMissed = false
  for (const d of rangeKeys(ix.startDay, ix.today)) {
    const s = statusOf(ix, habitId, d)
    if (isKept(s)) {
      cur++
      prevMissed = false
    } else if (s === 'missed') {
      if (prevMissed) cur = 0
      prevMissed = true
    }
    best = Math.max(best, cur)
  }
  return best
}

export function keptIn(ix: Index, habitIds: string[], from: DayKey, to: DayKey): { kept: number; full: number } {
  let kept = 0
  let full = 0
  for (const d of rangeKeys(from, to)) {
    for (const h of habitIds) {
      const s = statusOf(ix, h, d)
      if (isKept(s)) kept++
      if (s === 'full') full++
    }
  }
  return { kept, full }
}

export interface Race {
  you: number
  ghost: number
  max: number
  lead: number
  /** The ghost's window reaches back before day 1 — those days count as zero. */
  ghostForming: boolean
}

/** You (last `period` days) vs your ghost (the `period` days before that). */
export function raceOf(ix: Index, habitIds: string[], period: number): Race {
  const youFrom = addDays(ix.today, -(period - 1))
  const ghostTo = addDays(youFrom, -1)
  const ghostFrom = addDays(ghostTo, -(period - 1))
  const you = keptIn(ix, habitIds, youFrom, ix.today).kept
  const ghost = keptIn(ix, habitIds, ghostFrom, ghostTo).kept
  return { you, ghost, max: period * habitIds.length, lead: you - ghost, ghostForming: ghostFrom < ix.startDay }
}

export const PERIODS = [
  { days: 7, label: 'Week', ghostName: 'last-week you' },
  { days: 30, label: 'Month', ghostName: 'last-month you' },
  { days: 90, label: 'Quarter', ghostName: 'last-quarter you' },
] as const

/** Misses from the last few days that haven't been asked about yet. */
export function unansweredMisses(ix: Index, habits: Habit[], misses: Miss[], lookback = 3) {
  const answered = new Set(misses.map((m) => key(m.habitId, m.day)))
  const out: { habit: Habit; day: DayKey }[] = []
  for (let i = lookback; i >= 1; i--) {
    const day = addDays(ix.today, -i)
    for (const habit of habits) {
      if (statusOf(ix, habit.id, day) === 'missed' && !answered.has(key(habit.id, day))) out.push({ habit, day })
    }
  }
  return out
}

export function reasonCounts(misses: Miss[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const m of misses) for (const r of m.reasons) counts.set(r, (counts.get(r) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

export interface HabitHistory {
  /** Days since day 1, today included. */
  days: number
  kept: number
  full: number
  min: number
  missed: number
  /** Kept ÷ days that are over (today only counts once it's sealed). */
  rate: number
  chain: { links: number; cracks: number }
  longest: number
  thisMonth: number
  /** Kept rate per weekday, Monday first; null when that weekday hasn't come round yet. */
  weekdays: (number | null)[]
  /** Median minute of the day you seal it by hand (ritual seals only). */
  usualMinute?: number
  reasons: [string, number][]
  firstDay?: DayKey
}

export function habitHistory(ix: Index, habitId: string, misses: Miss[]): HabitHistory {
  const days = rangeKeys(ix.startDay, ix.today)
  let kept = 0
  let full = 0
  let missed = 0
  let thisMonth = 0
  const wdKept = Array(7).fill(0)
  const wdTotal = Array(7).fill(0)
  const times: number[] = []
  let firstDay: DayKey | undefined
  for (const d of days) {
    const s = statusOf(ix, habitId, d)
    if (s === 'pending') continue
    const wd = weekdayIndex(d)
    wdTotal[wd]++
    if (isKept(s)) {
      kept++
      wdKept[wd]++
      if (s === 'full') full++
      if (d.slice(0, 7) === ix.today.slice(0, 7)) thisMonth++
      firstDay ??= d
      const log = logOf(ix, habitId, d)!
      if (log.source === 'ritual') times.push(minutesInto(d, log.at))
    } else if (s === 'missed') missed++
  }
  const counted = kept + missed
  times.sort((a, b) => a - b)
  return {
    days: days.length,
    kept,
    full,
    min: kept - full,
    missed,
    rate: counted ? kept / counted : 0,
    chain: chainOf(ix, habitId),
    longest: longestChain(ix, habitId),
    thisMonth,
    weekdays: wdTotal.map((t, i) => (t ? wdKept[i] / t : null)),
    usualMinute: times.length >= 3 ? times[Math.floor(times.length / 2)] : undefined,
    reasons: reasonCounts(misses.filter((m) => m.habitId === habitId && statusOf(ix, habitId, m.day) === 'missed')),
    firstDay,
  }
}
