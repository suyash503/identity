import { db, type Habit, type IconKey, type Level, type Log, type RivalDay } from '../db'
import { addDays, diffDays, fmtDay, fmtMinute, minutesInto, monthKey, rangeKeys, weekdayIndex, type DayKey } from './day'
import { alertOf, isKept, keptIn, statusOf, type DayStatus, type Index } from './stats'

export const RIVAL = { name: 'Alankrit', color: '#d946ef' } as const

export type RivalMap = Map<DayKey, RivalDay>
export type Outcome = 'win' | 'loss' | 'draw'

// ── Deterministic randomness: the same date + habit always gives the same result ──

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seed: string): () => number {
  let a = hash(seed)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T,>(items: readonly T[], r: () => number) => items[Math.floor(r() * items.length)]
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** When Alankrit usually does each habit, in minutes after midnight. */
const WINDOWS: Record<IconKey, [number, number]> = {
  gym: [6 * 60, 9 * 60],
  torch: [14 * 60, 17.5 * 60],
  dsa: [19 * 60, 22.5 * 60],
  git: [22 * 60, 25.5 * 60],
}

// ── Scoring ──

const RANK: Record<DayStatus, number> = { full: 2, min: 1, missed: 0, pending: 0, none: 0 }

export function rivalStatus(rival: RivalMap, habitId: string, day: DayKey, ix: Index, now: number): DayStatus {
  if (day < ix.startDay || day > ix.today) return 'none'
  const res = rival.get(day)?.results[habitId]
  if (!res) return day === ix.today ? 'pending' : 'missed'
  if (day === ix.today && minutesInto(day, now) < res.minute) return 'pending'
  return res.level ?? 'missed'
}

/** Today's battle is live: an unfinished habit counts as 0 for now. */
export function battle(ix: Index, rival: RivalMap, habitId: string, day: DayKey, now: number): Outcome {
  const you = RANK[statusOf(ix, habitId, day)]
  const him = RANK[rivalStatus(rival, habitId, day, ix, now)]
  return you > him ? 'win' : you < him ? 'loss' : 'draw'
}

export interface Score {
  you: number
  him: number
  draws: number
}

export function scoreIn(ix: Index, rival: RivalMap, habitIds: string[], from: DayKey, to: DayKey, now: number): Score {
  const s: Score = { you: 0, him: 0, draws: 0 }
  const start = from < ix.startDay ? ix.startDay : from
  for (const d of rangeKeys(start, to)) {
    for (const h of habitIds) {
      const o = battle(ix, rival, h, d, now)
      if (o === 'win') s.you++
      else if (o === 'loss') s.him++
      else s.draws++
    }
  }
  return s
}

export const weekStart = (day: DayKey) => addDays(day, -weekdayIndex(day))
export const monthStart = (day: DayKey) => `${monthKey(day)}-01`

export interface Season {
  month: string
  label: string
  score: Score
  winner: 'you' | 'rival' | 'draw'
}

/** Finished months since day 1, newest first. */
export function pastSeasons(ix: Index, rival: RivalMap, habitIds: string[], now: number): Season[] {
  const out: Season[] = []
  let first = monthStart(ix.startDay)
  const current = monthStart(ix.today)
  while (first < current) {
    const next = monthStart(addDays(first, 32))
    const score = scoreIn(ix, rival, habitIds, first, addDays(next, -1), now)
    out.push({
      month: monthKey(first),
      label: fmtDay(first, { month: 'long', year: 'numeric' }),
      score,
      winner: score.you > score.him ? 'you' : score.you < score.him ? 'rival' : 'draw',
    })
    first = next
  }
  return out.reverse()
}

// ── Generation (adaptive, locked once written) ──

/** Your form for a habit over the 30 days before `day`. Alankrit never sees that day itself. */
function formBefore(ix: Index, habitId: string, day: DayKey) {
  const to = addDays(day, -1)
  const from = [addDays(day, -30), ix.startDay].sort()[1]
  const days = to < from ? 0 : diffDays(to, from) + 1
  if (days < 5) return { rate: 0.6, fullShare: 0.3 }
  const { kept, full } = keptIn(ix, [habitId], from, to)
  return { rate: kept / days, fullShare: kept ? full / kept : 0.3 }
}

function generateDay(ix: Index, habits: Habit[], day: DayKey, rival: RivalMap): RivalDay {
  const results: RivalDay['results'] = {}
  for (const habit of habits) {
    const r = rng(`alankrit|${day}|${habit.id}`)
    const { rate, fullShare } = formBefore(ix, habit.id, day)

    // Rubber band on this week's head-to-head for this habit (before today).
    let diff = 0
    for (let d = weekStart(day); d < day; d = addDays(d, 1)) {
      if (d < ix.startDay) continue
      const o = battle(ix, rival, habit.id, d, Infinity)
      diff += o === 'win' ? 1 : o === 'loss' ? -1 : 0
    }
    const band = diff >= 2 ? 0.07 : diff <= -2 ? -0.07 : 0

    const showUp = r() < clamp(rate + 0.08 + band, 0.35, 0.95)
    const level: Level | null = showUp ? (r() < clamp(fullShare + 0.1, 0.1, 0.8) ? 'full' : 'min') : null
    const [a, b] = WINDOWS[habit.icon]
    // A skip is revealed a little after the window closes.
    results[habit.id] = { level, minute: showUp ? Math.round(a + r() * (b - a)) : b + 15 }
  }
  return { day, results }
}

let inflight: Promise<void> | undefined

/** Generates and stores every missing day up to today. Stored days never change, so Alankrit can't cheat. */
export function ensureRivalDays(ix: Index, habits: Habit[]): Promise<void> {
  inflight ??= generateMissing(ix, habits).finally(() => (inflight = undefined))
  return inflight
}

async function generateMissing(ix: Index, habits: Habit[]) {
  const stored = await db.rival.where('day').between(ix.startDay, ix.today, true, true).toArray()
  const rival: RivalMap = new Map(stored.map((r) => [r.day, r]))
  const fresh: RivalDay[] = []
  for (const d of rangeKeys(ix.startDay, ix.today)) {
    if (rival.has(d)) continue
    const g = generateDay(ix, habits, d, rival)
    rival.set(d, g)
    fresh.push(g)
  }
  if (fresh.length) await db.rival.bulkPut(fresh)
}

// ── Voice: light trash talk ──

const DONE_FULL = [
  'Full {habit} session done. Your move.',
  '{habit}: full version. I’m not slowing down.',
  'Went all in on {habit}. Catch me if you can.',
]
const DONE_MIN = [
  '{habit} done. Minimum, but it counts. You?',
  'Bare minimum on {habit}. Still a point on the board.',
  'Quick {habit} session. Checked off.',
]
const SKIP = [
  'Skipped {habit} today. Don’t get used to it.',
  'No {habit} for me today. Take the point, while you can.',
  'Off day on {habit}. Rare. Enjoy it.',
]
const SPECIAL: Partial<Record<IconKey, string[]>> = {
  gym: ['Gym done at {time}. You up yet?'],
  git: ['Pushed at {time}. Green square secured.'],
  dsa: ['Solved it without peeking at the editorial. Your turn.'],
  torch: ['Finally get autograd. Well, mostly.'],
}

export interface FeedItem {
  key: string
  minute: number
  who: 'you' | 'rival'
  habit: Habit
  level: Level | null
  text: string
}

function minuteOfLog(log: Log, day: DayKey) {
  return minutesInto(day, log.at)
}

/** Everything that happened today, newest first. */
export function todayFeed(ix: Index, rival: RivalMap, habits: Habit[], now: number): FeedItem[] {
  const items: FeedItem[] = []
  const nowMin = minutesInto(ix.today, now)
  const res = rival.get(ix.today)?.results ?? {}
  for (const habit of habits) {
    const r = res[habit.id]
    if (r && r.minute <= nowMin) {
      const rand = rng(`line|${ix.today}|${habit.id}`)
      const pool = r.level === null ? SKIP : [...(r.level === 'full' ? DONE_FULL : DONE_MIN), ...(SPECIAL[habit.icon] ?? [])]
      const text = pick(pool, rand).replaceAll('{habit}', habit.name).replaceAll('{time}', fmtMinute(r.minute))
      items.push({ key: `r-${habit.id}`, minute: r.minute, who: 'rival', habit, level: r.level, text })
    }
    const log = ix.logs.get(`${habit.id}|${ix.today}`)
    if (log) {
      const text = log.source === 'github' && !log.photoId ? `GitHub push detected: ${habit.name} sealed` : `You sealed ${habit.name}${log.level === 'full' ? ', full version' : ''}`
      items.push({ key: `y-${habit.id}`, minute: minuteOfLog(log, ix.today), who: 'you', habit, level: log.level, text })
    }
  }
  return items.sort((a, b) => b.minute - a.minute)
}

/** Alankrit's headline for the day, based on the state of the rivalry. */
export function taunt(ix: Index, rival: RivalMap, habits: Habit[], now: number): string {
  const r = rng(`taunt|${ix.today}|${Math.floor(minutesInto(ix.today, now) / 180)}`)
  const ids = habits.map((h) => h.id)
  const danger = habits.find((h) => alertOf(ix, h.id) !== 'none')
  if (danger) return `You missed ${danger.name} yesterday. Miss today and I’m lapping you.`
  if (habits.every((h) => isKept(statusOf(ix, h.id, ix.today)))) return pick(['Fine. Today’s yours. Tomorrow’s mine.', 'Clean sweep. Annoying. Respect.'], r)
  const week = scoreIn(ix, rival, ids, weekStart(ix.today), ix.today, now)
  const gap = week.him - week.you
  if (gap >= 2) return pick([`${gap} battles up this week. Rest day again?`, 'I’m not tired. Are you?', `Up ${gap} this week and I haven’t even warmed up.`], r)
  if (gap <= -2) return pick([`You’re ${-gap} up this week. Enjoy it while it lasts.`, 'You out-worked me this week. Won’t happen twice.'], r)
  return pick(['Dead even. Let’s see who blinks.', 'New day. I’ve already started.', 'Every point counts. I’m counting.'], r)
}
