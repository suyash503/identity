// A "day" ends at 4 AM, not midnight, so late-night work counts for the day you were living.
export const DAY_START_HOUR = 4

/** Local calendar date as YYYY-MM-DD. String comparison == chronological comparison. */
export type DayKey = string

const pad = (n: number) => String(n).padStart(2, '0')

export function keyFromDate(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function dayKeyOf(t: Date | number = Date.now()): DayKey {
  const d = new Date(typeof t === 'number' ? t : t.getTime())
  d.setHours(d.getHours() - DAY_START_HOUR)
  return keyFromDate(d)
}

/** Noon avoids DST edge cases when doing day arithmetic. */
export function parseKey(k: DayKey): Date {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function addDays(k: DayKey, n: number): DayKey {
  const d = parseKey(k)
  d.setDate(d.getDate() + n)
  return keyFromDate(d)
}

/** a - b in days. */
export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((parseKey(a).getTime() - parseKey(b).getTime()) / 86_400_000)
}

/** Inclusive range, oldest first. */
export function rangeKeys(from: DayKey, to: DayKey): DayKey[] {
  const out: DayKey[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export function fmtDay(k: DayKey, opts: Intl.DateTimeFormatOptions): string {
  return parseKey(k).toLocaleDateString('en-GB', opts)
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(k: DayKey): number {
  return (parseKey(k).getDay() + 6) % 7
}

export function relativeDay(k: DayKey, today: DayKey): string {
  const diff = diffDays(today, k)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return fmtDay(k, { weekday: 'long', day: 'numeric', month: 'short' })
}

/** Minutes since the calendar midnight that starts `day` (goes past 1440 until the 4 AM rollover). */
export function minutesInto(day: DayKey, t: number = Date.now()): number {
  const [y, m, d] = day.split('-').map(Number)
  return (t - new Date(y, m - 1, d).getTime()) / 60_000
}

export function fmtMinute(minute: number): string {
  const total = Math.round(minute) % 1440
  const h = Math.floor(total / 60)
  const m = total % 60
  const h12 = h % 12 || 12
  return `${h12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`
}

export function monthKey(day: DayKey): string {
  return day.slice(0, 7)
}
