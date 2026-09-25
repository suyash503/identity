import { db, type Habit, type RivalDay } from '../db'
import { rangeKeys } from './day'
import type { Index } from './stats'
import { generateDay, type RivalMap } from './alankrit'
import { fetchServerRivalDays } from './cloud'

let inflight: Promise<void> | undefined

/**
 * Makes sure every day up to today has Alankrit's result stored. Stored days never change, so he can't cheat.
 * When the server already locked in a day (to send notifications while the app was closed), that exact day is adopted.
 */
export function ensureRivalDays(ix: Index, habits: Habit[]): Promise<void> {
  inflight ??= generateMissing(ix, habits).finally(() => (inflight = undefined))
  return inflight
}

async function generateMissing(ix: Index, habits: Habit[]) {
  const stored = await db.rival.where('day').between(ix.startDay, ix.today, true, true).toArray()
  const rival: RivalMap = new Map(stored.map((r) => [r.day, r]))
  const missing = rangeKeys(ix.startDay, ix.today).filter((d) => !rival.has(d))
  if (!missing.length) return

  const fromServer = await fetchServerRivalDays(missing[0]).catch(() => [] as RivalDay[])
  const serverDays = new Map(fromServer.map((r) => [r.day, r]))
  const fresh: RivalDay[] = []
  for (const d of missing) {
    const g = serverDays.get(d) ?? generateDay(ix, habits, d, rival)
    rival.set(d, g)
    fresh.push(g)
  }
  await db.rival.bulkPut(fresh)
}
