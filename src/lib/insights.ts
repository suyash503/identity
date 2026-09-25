// Pattern insights: plain-language findings from your own history. Pure functions, no UI.
// Every insight stays locked until there's enough data to say something honest.
import type { CheckIn, Habit, Log, Miss } from '../db'
import { addDays, fmtDay, fmtMinute, minutesInto, rangeKeys, weekdayIndex, type DayKey } from './day'
import { isKept, statusOf, type Index } from './stats'

export type InsightKind = 'reason' | 'weekday' | 'domino' | 'sleep' | 'energy' | 'late' | 'recovery'

export interface Bar {
  label: string
  /** 0..1 */
  value: number
  highlight?: boolean
}

export interface Insight {
  kind: InsightKind
  title: string
  ready: boolean
  /** Locked: 0..1 towards unlocking. */
  progress: number
  /** Locked: what's still needed, e.g. "9 more days". */
  needs?: string
  /** Ready: the big number, e.g. "70%" or "Thu". */
  headline?: string
  body: string
  bars?: Bar[]
  /** Ready: what the finding is based on. */
  basis?: string
  habit?: Habit
}

export const SLEEP_OPTIONS = [
  { label: 'Before 11', value: 22 * 60 + 30 },
  { label: '11–12', value: 23 * 60 + 30 },
  { label: '12–1', value: 24 * 60 + 30 },
  { label: '1–2', value: 25 * 60 + 30 },
  { label: 'After 2', value: 26 * 60 + 30 },
] as const
export const LATE_SLEEP = 25 * 60 // after 1 AM

export const ENERGY_LABELS = ['Drained', 'Low', 'Okay', 'Good', 'Charged'] as const

export const sleepLabel = (sleep: number) => SLEEP_OPTIONS.reduce((a, b) => (Math.abs(b.value - sleep) < Math.abs(a.value - sleep) ? b : a)).label

const pct = (v: number) => `${Math.round(v * 100)}%`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : word.endsWith('s') ? 'es' : 's'}`

interface Ctx {
  ix: Index
  habits: Habit[]
  logs: Log[]
  misses: Miss[]
  checkins: Map<DayKey, CheckIn>
  /** Finished days only: today is still being played. */
  days: DayKey[]
  daySet: Set<DayKey>
}

function keptRate(ctx: Ctx, days: DayKey[], habitIds = ctx.habits.map((h) => h.id)): number {
  let kept = 0
  let total = 0
  for (const d of days)
    for (const h of habitIds) {
      total++
      if (isKept(statusOf(ctx.ix, h, d))) kept++
    }
  return total ? kept / total : 0
}

const missed = (ctx: Ctx, habitId: string, day: DayKey) => statusOf(ctx.ix, habitId, day) === 'missed'

function locked(kind: InsightKind, title: string, have: number, need: number, unit: string, body: string): Insight {
  return { kind, title, ready: false, progress: Math.min(1, have / need), needs: `${plural(Math.max(0, need - have), unit)}`, body }
}

// ── The insights ──

function topReason(ctx: Ctx): Insight {
  const explained = ctx.misses.filter((m) => m.reasons.length > 0)
  const need = 5
  if (explained.length < need) {
    return locked('reason', 'Your #1 trigger', explained.length, need, 'more explained miss', 'Answer “what got in the way?” after misses and your most common trigger shows up here.')
  }
  const counts = new Map<string, number>()
  for (const m of explained) for (const r of m.reasons) counts.set(r, (counts.get(r) ?? 0) + 1)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const [reason, n] = ranked[0]
  const byHabit = new Map<string, number>()
  for (const m of explained) if (m.reasons.includes(reason)) byHabit.set(m.habitId, (byHabit.get(m.habitId) ?? 0) + 1)
  const [habitId, habitCount] = [...byHabit.entries()].sort((a, b) => b[1] - a[1])[0]
  const habit = ctx.habits.find((h) => h.id === habitId)
  return {
    kind: 'reason',
    title: 'Your #1 trigger',
    ready: true,
    progress: 1,
    headline: reason,
    body: `It’s behind ${n} of the ${explained.length} misses you explained${habit ? `, most often ${habit.name} (${habitCount})` : ''}.`,
    bars: ranked.slice(0, 4).map(([label, c], i) => ({ label, value: c / explained.length, highlight: i === 0 })),
    basis: `${plural(explained.length, 'explained miss')}`,
    habit,
  }
}

function weakestWeekday(ctx: Ctx): Insight {
  const need = 21
  if (ctx.days.length < need) return locked('weekday', 'Weakest day of the week', ctx.days.length, need, 'more day', 'After three weeks, you’ll see which weekday you slip on most.')
  const rates = Array.from({ length: 7 }, (_, w) => keptRate(ctx, ctx.days.filter((d) => weekdayIndex(d) === w)))
  const worst = rates.indexOf(Math.min(...rates))
  const others = keptRate(ctx, ctx.days.filter((d) => weekdayIndex(d) !== worst))
  const worstDays = ctx.days.filter((d) => weekdayIndex(d) === worst)
  // Which habit drops the most on that day?
  let dropHabit: Habit | undefined
  let drop = 0
  for (const h of ctx.habits) {
    const diff = keptRate(ctx, ctx.days.filter((d) => weekdayIndex(d) !== worst), [h.id]) - keptRate(ctx, worstDays, [h.id])
    if (diff > drop) [drop, dropHabit] = [diff, h]
  }
  const dayName = fmtDay(worstDays[0], { weekday: 'long' })
  const gap = others - rates[worst]
  return {
    kind: 'weekday',
    title: 'Weakest day of the week',
    ready: true,
    progress: 1,
    headline: fmtDay(worstDays[0], { weekday: 'short' }),
    body:
      gap < 0.1
        ? `No real weak spot: ${dayName} is your lowest, but only slightly (${pct(rates[worst])} vs ${pct(others)}). You’re consistent across the week.`
        : `You keep ${pct(rates[worst])} of your habits on ${dayName}s vs ${pct(others)} on other days${dropHabit && drop > 0.15 ? `. ${dropHabit.name} drops the most` : ''}. Plan ${dayName}s on purpose.`,
    bars: rates.map((v, w) => ({ label: 'MTWTFSS'[w], value: v, highlight: w === worst })),
    basis: `${plural(ctx.days.length, 'day')}`,
    habit: dropHabit,
  }
}

function domino(ctx: Ctx): Insight {
  const need = 21
  if (ctx.days.length < need) return locked('domino', 'Your domino habit', ctx.days.length, need, 'more day', 'Finds the habit that, when it slips, drags the others down with it.')
  let best: { a: Habit; b: Habit; when: number; otherwise: number; n: number } | undefined
  for (const a of ctx.habits) {
    const aMissDays = ctx.days.filter((d) => missed(ctx, a.id, d))
    const aKeptDays = ctx.days.filter((d) => !missed(ctx, a.id, d))
    if (aMissDays.length < 4 || aKeptDays.length < 4) continue
    for (const b of ctx.habits) {
      if (a === b) continue
      const when = aMissDays.filter((d) => missed(ctx, b.id, d)).length / aMissDays.length
      const otherwise = aKeptDays.filter((d) => missed(ctx, b.id, d)).length / aKeptDays.length
      if (when >= 0.5 && when - otherwise >= 0.25 && (!best || when - otherwise > best.when - best.otherwise)) {
        best = { a, b, when, otherwise, n: aMissDays.length }
      }
    }
  }
  if (!best) {
    return {
      kind: 'domino',
      title: 'Your domino habit',
      ready: true,
      progress: 1,
      headline: 'None',
      body: 'Your habits fail independently. One slip doesn’t drag the others down. That’s a strong sign.',
      basis: `${plural(ctx.days.length, 'day')}`,
    }
  }
  return {
    kind: 'domino',
    title: 'Your domino habit',
    ready: true,
    progress: 1,
    headline: best.a.name,
    body: `When ${best.a.name} slips, ${best.b.name} slips the same day ${pct(best.when)} of the time (vs ${pct(best.otherwise)} when ${best.a.name} holds). Protect ${best.a.name} and the rest follows.`,
    bars: [
      { label: `${best.a.name} missed`, value: best.when, highlight: true },
      { label: `${best.a.name} kept`, value: best.otherwise },
    ],
    basis: `${plural(best.n, `${best.a.name} miss`)} over ${plural(ctx.days.length, 'day')}`,
    habit: best.a,
  }
}

function sleep(ctx: Ctx): Insight {
  const withSleep = ctx.days.filter((d) => ctx.checkins.get(d)?.sleep !== undefined)
  const late = withSleep.filter((d) => ctx.checkins.get(d)!.sleep! >= LATE_SLEEP)
  const early = withSleep.filter((d) => ctx.checkins.get(d)!.sleep! < LATE_SLEEP)
  const need = 4
  if (late.length < need || early.length < need) {
    const have = Math.min(late.length, need) + Math.min(early.length, need)
    return {
      ...locked('sleep', 'What late nights cost you', have, need * 2, 'more check-in', 'Log when you fell asleep in the evening check-in. You need a few nights before and after 1 AM to compare.'),
      needs: late.length < need ? `${plural(need - late.length, 'more night')} after 1 AM` : `${plural(need - early.length, 'more night')} before 1 AM`,
    }
  }
  const lateRate = keptRate(ctx, late)
  const earlyRate = keptRate(ctx, early)
  const diff = earlyRate - lateRate
  return {
    kind: 'sleep',
    title: 'What late nights cost you',
    ready: true,
    progress: 1,
    headline: diff >= 0.05 ? `−${pct(diff)}` : 'Nothing',
    body:
      diff >= 0.05
        ? `After nights you slept past 1 AM, you keep ${pct(lateRate)} of your habits. After earlier nights: ${pct(earlyRate)}.`
        : `Sleeping past 1 AM doesn’t seem to hurt your habits (${pct(lateRate)} vs ${pct(earlyRate)}).`,
    bars: [
      { label: 'Slept before 1 AM', value: earlyRate },
      { label: 'Slept after 1 AM', value: lateRate, highlight: true },
    ],
    basis: `${plural(withSleep.length, 'night')} logged`,
  }
}

function energy(ctx: Ctx): Insight {
  const logged = ctx.days.filter((d) => ctx.checkins.get(d)?.energy !== undefined)
  const low = logged.filter((d) => ctx.checkins.get(d)!.energy! <= 2)
  const high = logged.filter((d) => ctx.checkins.get(d)!.energy! >= 4)
  const need = 3
  if (low.length < need || high.length < need) {
    const have = Math.min(low.length, need) + Math.min(high.length, need)
    return {
      ...locked('energy', 'Low-energy days', have, need * 2, 'more check-in', 'Rate your energy in the evening check-in to see how you hold up on bad days.'),
      needs: low.length < need ? `${plural(need - low.length, 'more low-energy day')}` : `${plural(need - high.length, 'more high-energy day')}`,
    }
  }
  const lowRate = keptRate(ctx, low)
  const highRate = keptRate(ctx, high)
  return {
    kind: 'energy',
    title: 'Low-energy days',
    ready: true,
    progress: 1,
    headline: pct(lowRate),
    body:
      lowRate >= 0.6
        ? `Even on drained days you keep ${pct(lowRate)} of your habits. The bare minimum is doing its job.`
        : `On drained days you keep ${pct(lowRate)} vs ${pct(highRate)} on good days. That’s when the bare minimum matters most.`,
    bars: [
      { label: 'Good days (4–5)', value: highRate },
      { label: 'Drained days (1–2)', value: lowRate, highlight: true },
    ],
    basis: `${plural(logged.length, 'day')} rated`,
  }
}

function lateSeals(ctx: Ctx): Insight {
  // When do you seal each habit? (GitHub auto-seals don't count: that's the push time, not yours.)
  const ritual = ctx.logs.filter((l) => l.source === 'ritual' && ctx.daySet.has(l.day))
  const lastSeal = new Map<DayKey, number>()
  for (const l of ritual) lastSeal.set(l.day, Math.max(lastSeal.get(l.day) ?? 0, minutesInto(l.day, l.at)))
  const pairs = ctx.days.filter((d) => lastSeal.has(d) && ctx.daySet.has(addDays(d, 1)))
  const need = 14
  if (pairs.length < need) return locked('late', 'Late-night sealing', pairs.length, need, 'more day', 'Checks whether sealing habits late at night hurts the next day.')

  const lateDays = pairs.filter((d) => lastSeal.get(d)! >= 23 * 60)
  const next = (ds: DayKey[]) => keptRate(ctx, ds.map((d) => addDays(d, 1)))
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const latest = ctx.habits
    .map((h) => ({ h, times: ritual.filter((l) => l.habitId === h.id).map((l) => minutesInto(l.day, l.at)) }))
    .filter((x) => x.times.length >= 5)
    .map((x) => ({ h: x.h, median: median(x.times) }))
    .sort((a, b) => b.median - a.median)[0]
  const when = latest ? `You usually seal ${latest.h.name} around ${fmtMinute(latest.median)}. ` : ''

  if (lateDays.length < 3) {
    return {
      kind: 'late',
      title: 'Late-night sealing',
      ready: true,
      progress: 1,
      headline: latest ? fmtMinute(latest.median) : '—',
      body: `${when}You rarely finish after 11 PM. Nice.`,
      basis: `${plural(pairs.length, 'day')}`,
      habit: latest?.h,
    }
  }
  const lateNext = next(lateDays)
  const lateSet = new Set(lateDays)
  const otherNext = next(pairs.filter((d) => !lateSet.has(d)))
  const hurts = otherNext - lateNext >= 0.1
  return {
    kind: 'late',
    title: 'Late-night sealing',
    ready: true,
    progress: 1,
    headline: latest ? fmtMinute(latest.median) : '—',
    body: hurts
      ? `${when}The day after a seal past 11 PM, you keep ${pct(lateNext)} of your habits vs ${pct(otherNext)} otherwise. Earlier seals protect tomorrow.`
      : `${when}Late seals don’t seem to hurt the next day (${pct(lateNext)} vs ${pct(otherNext)}).`,
    bars: [
      { label: 'After an earlier finish', value: otherNext },
      { label: 'After an 11 PM+ finish', value: lateNext, highlight: true },
    ],
    basis: `${plural(pairs.length, 'day')}, ${lateDays.length} late`,
    habit: latest?.h,
  }
}

function recovery(ctx: Ctx): Insight {
  let slips = 0
  let bounced = 0
  for (const d of ctx.days) {
    const next = addDays(d, 1)
    if (!ctx.daySet.has(next)) continue
    for (const h of ctx.habits) {
      if (!missed(ctx, h.id, d)) continue
      slips++
      if (!missed(ctx, h.id, next)) bounced++
    }
  }
  const need = 3
  if (slips < need) return locked('recovery', 'Bounce-back rate', slips, need, 'more miss', 'After a few misses, this shows how often you recover the very next day.')
  const rate = bounced / slips
  return {
    kind: 'recovery',
    title: 'Bounce-back rate',
    ready: true,
    progress: 1,
    headline: `${bounced}/${slips}`,
    body:
      rate >= 0.7
        ? `After a miss, you kept the habit the very next day ${pct(rate)} of the time. Never-miss-twice is working.`
        : `After a miss, you recover the next day only ${pct(rate)} of the time. The day after a miss is the one to protect.`,
    bars: [{ label: 'Recovered next day', value: rate, highlight: true }],
    basis: `${plural(slips, 'miss')}`,
  }
}

export function computeInsights(ix: Index, habits: Habit[], logs: Log[], misses: Miss[], checkins: Map<DayKey, CheckIn>): Insight[] {
  const yesterday = addDays(ix.today, -1)
  const days = yesterday < ix.startDay ? [] : rangeKeys(ix.startDay, yesterday)
  const ctx: Ctx = { ix, habits, logs, misses, checkins, days, daySet: new Set(days) }
  const all = [topReason(ctx), domino(ctx), sleep(ctx), weakestWeekday(ctx), recovery(ctx), energy(ctx), lateSeals(ctx)]
  // Ready findings first, then the ones closest to unlocking.
  return all.sort((a, b) => Number(b.ready) - Number(a.ready) || b.progress - a.progress)
}
