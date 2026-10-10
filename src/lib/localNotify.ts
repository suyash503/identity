// The Android app schedules its own notifications on the phone, no server needed.
// Same moments as the server's web push: Alankrit's moves, danger days, the evening check. Quiet 11:30 PM–7 AM.
import { LocalNotifications } from '@capacitor/local-notifications'
import type { Habit } from '../db'
import { rivalLine, type RivalMap } from './alankrit'
import { addDays, minutesInto, type DayKey } from './day'
import { alertOf, isKept, missRun, statusOf, type Index } from './stats'
import type { PushPrefs } from './cloud'

const QUIET_FROM = 23 * 60 + 30
const QUIET_UNTIL = 7 * 60

interface Planned {
  id: number
  title: string
  body: string
  at: Date
}

const midnightOf = (day: DayKey) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}
const atMinute = (day: DayKey, minute: number) => new Date(midnightOf(day) + minute * 60_000)
const quiet = (minute: number) => minute >= QUIET_FROM || minute < QUIET_UNTIL

export function planNotifications(ix: Index, habits: Habit[], rival: RivalMap, prefs: PushPrefs, now = Date.now()): Planned[] {
  const today = ix.today
  const nowMin = minutesInto(today, now)
  const out: Planned[] = []
  const future = (minute: number) => minute > nowMin + 1 && !quiet(minute)

  if (prefs.rival) {
    const results = rival.get(today)?.results ?? {}
    habits.forEach((h, i) => {
      const r = results[h.id]
      if (r && future(r.minute)) out.push({ id: 1000 + i, title: `Alankrit · ${h.name}`, body: rivalLine(today, h, r), at: atMinute(today, r.minute) })
    })
  }

  const danger = habits.filter((h) => alertOf(ix, h.id) !== 'none')
  if (prefs.danger) {
    danger.forEach((h, i) => {
      const broken = alertOf(ix, h.id) === 'broken'
      if (future(19 * 60)) {
        out.push({
          id: 2000 + i,
          title: broken ? `${missRun(ix, h.id)} days missed · ${h.name}` : `Danger day · ${h.name}`,
          body: broken ? `Your ghost is gaining. One minimum starts a new chain: ${h.minimum}` : `You missed yesterday. Don’t miss twice. Just the minimum: ${h.minimum}`,
          at: atMinute(today, 19 * 60),
        })
      }
      if (future(22 * 60 + 30)) {
        out.push({
          id: 2100 + i,
          title: `Last call · ${h.name}`,
          body: broken ? `Start the new chain tonight. Just this: ${h.minimum}` : `Miss today and Alankrit laps you. Just this: ${h.minimum}`,
          at: atMinute(today, 22 * 60 + 30),
        })
      }
    })
  }

  if (prefs.evening && future(21 * 60)) {
    const open = habits.filter((h) => !isKept(statusOf(ix, h.id, today)) && !danger.includes(h))
    if (open.length) out.push({ id: 3000, title: 'Still open today', body: `${open.map((h) => h.name).join(', ')}. The bare minimum is enough.`, at: atMinute(today, 21 * 60) })
  }

  // If the app isn't opened tomorrow, one gentle nudge still arrives. Opening the app replaces it with the real plan.
  out.push({ id: 4000, title: 'IDENTITY', body: 'Never miss twice. Open the app and seal today’s minimums.', at: atMinute(addDays(today, 1), 19 * 60) })
  return out
}

/** Replaces everything scheduled with the current plan. Called on launch and after every change. */
export async function rescheduleNotifications(planned: Planned[]) {
  if ((await LocalNotifications.checkPermissions()).display !== 'granted') return
  const pending = await LocalNotifications.getPending()
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) })
  if (!planned.length) return
  await LocalNotifications.schedule({
    notifications: planned.map((p) => ({ id: p.id, title: p.title, body: p.body, schedule: { at: p.at, allowWhileIdle: true } })),
  })
}

export async function cancelAllNotifications() {
  const pending = await LocalNotifications.getPending()
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) })
}

export async function requestNotificationPermission(): Promise<boolean> {
  const status = await LocalNotifications.requestPermissions()
  return status.display === 'granted'
}

export async function sendTestNotification() {
  await LocalNotifications.schedule({
    notifications: [{ id: 9000, title: 'IDENTITY', body: 'Notifications work. Alankrit is watching.', schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true } }],
  })
}
