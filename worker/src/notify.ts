// Decides which notifications are due and sends them. Runs from the 15-minute cron.
// Alankrit, streaks and danger days use the app's own code (src/lib), so phone and server always agree.
import { buildPushPayload, type PushSubscription } from '@block65/webcrypto-web-push'
import type { Habit, Log, RivalDay } from '../../src/db'
import { generateDay, rivalLine, type RivalMap } from '../../src/lib/alankrit'
import { addDays, type DayKey } from '../../src/lib/day'
import { alertOf, buildIndex, isKept, missRun, statusOf } from '../../src/lib/stats'

export type NotifyEnv = Env & { VAPID_PRIVATE_KEY: string }

/** What the app uploads after each change: recent history only, so the cron stays cheap. */
export interface AppState {
  timeZone: string
  startDay: DayKey
  habits: Habit[]
  logs: Log[]
  rival: RivalDay[]
}

export interface PushPrefs {
  rival: boolean
  danger: boolean
  evening: boolean
}

interface SubscriptionRow {
  endpoint: string
  device_id: string
  p256dh: string
  auth: string
  time_zone: string
  prefs: string
}

interface Message {
  key: string
  title: string
  body: string
  tag: string
}

const QUIET_FROM = 23 * 60 + 30 // 11:30 PM
const QUIET_UNTIL = 7 * 60 // 7:00 AM
const DANGER_FIRST = 19 * 60 // 7 PM
const DANGER_LAST = 22 * 60 + 30 // 10:30 PM
const EVENING = 21 * 60 // 9 PM
const RIVAL_FRESH_FOR = 180 // don't announce Alankrit's moves older than 3 hours

/** "Today" and minutes since its midnight in the user's time zone. A day ends at 4 AM, like in the app. */
export function localClock(now: number, timeZone: string): { today: DayKey; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = (t: number) => Object.fromEntries(fmt.formatToParts(t).map((p) => [p.type, p.value]))
  const shifted = parts(now - 4 * 3_600_000)
  const today = `${shifted.year}-${shifted.month}-${shifted.day}`
  const cur = parts(now)
  const minute = Number(cur.hour) * 60 + Number(cur.minute) + (`${cur.year}-${cur.month}-${cur.day}` === today ? 0 : 1440)
  return { today, minute }
}

export async function loadState(env: NotifyEnv): Promise<AppState | null> {
  const row = await env.DB.prepare('SELECT data FROM state WHERE id = 1').first<{ data: string }>()
  return row ? (JSON.parse(row.data) as AppState) : null
}

/** Alankrit's days: the app's first, then the server's; any day still missing (up to today) is generated and locked in. */
export async function rivalDays(env: NotifyEnv, state: AppState, today: DayKey): Promise<RivalMap> {
  const since = addDays(today, -13)
  const rival: RivalMap = new Map(state.rival.map((r) => [r.day, r]))
  const { results } = await env.DB.prepare('SELECT day, data FROM rival_days WHERE day >= ?').bind(since).all<{ day: string; data: string }>()
  for (const r of results) if (!rival.has(r.day)) rival.set(r.day, JSON.parse(r.data) as RivalDay)

  if (today < state.startDay) return rival
  const ix = buildIndex(state.logs, state.startDay, today)
  for (let d = since < state.startDay ? state.startDay : since; d <= today; d = addDays(d, 1)) {
    if (rival.has(d)) continue
    const g = generateDay(ix, state.habits, d, rival)
    await env.DB.prepare('INSERT OR IGNORE INTO rival_days (day, data, created_at) VALUES (?, ?, ?)').bind(d, JSON.stringify(g), Date.now()).run()
    // If another run beat us to it, theirs is the locked one.
    const locked = await env.DB.prepare('SELECT data FROM rival_days WHERE day = ?').bind(d).first<{ data: string }>()
    rival.set(d, locked ? (JSON.parse(locked.data) as RivalDay) : g)
  }
  return rival
}

export function dueMessages(state: AppState, rival: RivalMap, today: DayKey, minute: number, prefs: PushPrefs): Message[] {
  if (today < state.startDay) return []
  if (minute >= QUIET_FROM || minute < QUIET_UNTIL) return []
  const ix = buildIndex(state.logs, state.startDay, today)
  const out: Message[] = []

  if (prefs.rival) {
    const results = rival.get(today)?.results ?? {}
    for (const habit of state.habits) {
      const r = results[habit.id]
      if (!r || r.minute > minute || minute - r.minute > RIVAL_FRESH_FOR) continue
      out.push({ key: `rival|${habit.id}`, title: `Alankrit · ${habit.name}`, body: rivalLine(today, habit, r), tag: `rival-${habit.id}` })
    }
  }

  const danger = state.habits.filter((h) => alertOf(ix, h.id) !== 'none')
  if (prefs.danger) {
    for (const h of danger) {
      const broken = alertOf(ix, h.id) === 'broken'
      if (minute >= DANGER_LAST) {
        const body = broken ? `Start the new chain tonight. Just this: ${h.minimum}` : `Miss today and Alankrit laps you. Just this: ${h.minimum}`
        out.push({ key: `danger-last|${h.id}`, title: `Last call · ${h.name}`, body, tag: `danger-${h.id}` })
      } else if (minute >= DANGER_FIRST) {
        const title = broken ? `${missRun(ix, h.id)} days missed · ${h.name}` : `Danger day · ${h.name}`
        const body = broken
          ? `Your ghost is gaining. One minimum starts a new chain: ${h.minimum}`
          : `You missed yesterday. Don’t miss twice. Just the minimum: ${h.minimum}`
        out.push({ key: `danger|${h.id}`, title, body, tag: `danger-${h.id}` })
      }
    }
  }

  if (prefs.evening && minute >= EVENING) {
    const open = state.habits.filter((h) => !isKept(statusOf(ix, h.id, today)) && !danger.includes(h))
    if (open.length) {
      out.push({ key: 'evening', title: 'Still open today', body: `${open.map((h) => h.name).join(', ')}. The bare minimum is enough.`, tag: 'evening' })
    }
  }
  return out
}

function toSubscription(row: SubscriptionRow): PushSubscription {
  return { endpoint: row.endpoint, expirationTime: null, keys: { p256dh: row.p256dh, auth: row.auth } }
}

/** Sends one push and returns the push service's HTTP status. Subscriptions that are gone for good are removed. */
export async function sendPush(env: NotifyEnv, row: SubscriptionRow, payload: { title: string; body: string; tag: string }): Promise<number> {
  const vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
  const req = await buildPushPayload({ data: JSON.stringify(payload), options: { ttl: 3 * 3600, urgency: 'normal' } }, toSubscription(row), vapid)
  const res = await fetch(row.endpoint, req)
  if (res.status === 404 || res.status === 410) {
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(row.endpoint).run()
  } else if (!res.ok) {
    console.error('push failed', res.status, await res.text().catch(() => ''))
  }
  return res.status
}

export async function subscriptionsFor(env: NotifyEnv, deviceId?: string): Promise<SubscriptionRow[]> {
  const q = deviceId
    ? env.DB.prepare('SELECT * FROM push_subscriptions WHERE device_id = ?').bind(deviceId)
    : env.DB.prepare('SELECT * FROM push_subscriptions')
  return (await q.all<SubscriptionRow>()).results
}

export async function runNotifications(env: NotifyEnv, now = Date.now()) {
  const subs = await subscriptionsFor(env)
  if (!subs.length) return
  const state = await loadState(env)
  if (!state) return

  for (const sub of subs) {
    const { today, minute } = localClock(now, sub.time_zone || state.timeZone)
    const rival = await rivalDays(env, state, today)
    for (const m of dueMessages(state, rival, today, minute, JSON.parse(sub.prefs) as PushPrefs)) {
      // Claim the message first so overlapping runs can't send it twice.
      const claim = await env.DB.prepare('INSERT OR IGNORE INTO push_sent (key, sent_at) VALUES (?, ?)')
        .bind(`${sub.device_id}|${today}|${m.key}`, now)
        .run()
      if (claim.meta.changes !== 1) continue
      const status = await sendPush(env, sub, { title: m.title, body: m.body, tag: m.tag })
      if (status === 404 || status === 410) break
    }
  }
  await env.DB.prepare('DELETE FROM push_sent WHERE sent_at < ?').bind(now - 8 * 86_400_000).run()
}
