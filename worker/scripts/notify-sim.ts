// Simulates one day of the notification cron with a made-up history. Run: npm run sim
import { dueMessages, localClock, type AppState } from '../src/notify'
import { generateDay, type RivalMap } from '../../src/lib/alankrit'
import { addDays } from '../../src/lib/day'
import { buildIndex } from '../../src/lib/stats'
import { DEFAULT_HABITS, type Log } from '../../src/db'

const today = '2026-09-25'
const startDay = '2026-09-01'
const logs: Log[] = []
for (let d = startDay; d < today; d = addDays(d, 1)) {
  for (const h of DEFAULT_HABITS) {
    const skip = (h.id === 'dsa' && d === addDays(today, -1)) || (h.id === 'torch' && d >= addDays(today, -2))
    if (!skip) logs.push({ habitId: h.id, day: d, level: 'min', source: 'ritual', at: 0 })
  }
}
logs.push({ habitId: 'gym', day: today, level: 'full', source: 'ritual', at: 0 })
const state: AppState = { timeZone: 'Asia/Kolkata', startDay, habits: DEFAULT_HABITS, logs, rival: [] }

const ix = buildIndex(logs, startDay, today)
const rival: RivalMap = new Map()
for (let d = startDay; d <= today; d = addDays(d, 1)) rival.set(d, generateDay(ix, DEFAULT_HABITS, d, rival))
console.log('Alankrit today:', JSON.stringify(rival.get(today)!.results))

const prefs = { rival: true, danger: true, evening: true }
const seen = new Set<string>()
for (let minute = 6 * 60; minute <= 26 * 60; minute += 15) {
  for (const m of dueMessages(state, rival, today, minute, prefs)) {
    if (seen.has(m.key)) continue
    seen.add(m.key)
    const hh = String(Math.floor(minute / 60) % 24).padStart(2, '0')
    console.log(`${hh}:${String(minute % 60).padStart(2, '0')}  ${m.title.padEnd(24)} ${m.body}`)
  }
}

// Clock: 11:10 PM UTC on Sep 24 is 4:40 AM Sep 25 in India, the start of the new day there.
console.log('clock 04:40 IST ->', JSON.stringify(localClock(Date.UTC(2026, 8, 24, 23, 10), 'Asia/Kolkata')))
console.log('clock 02:00 IST ->', JSON.stringify(localClock(Date.UTC(2026, 8, 24, 20, 30), 'Asia/Kolkata')), '(still Sep 24, minute > 1440)')
