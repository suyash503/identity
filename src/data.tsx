import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Habit, type Log, type Miss } from './db'
import { dayKeyOf, type DayKey } from './lib/day'
import { buildIndex, type Index } from './lib/stats'
import { syncGithub } from './lib/github'
import { ensureRivalDays, type RivalMap } from './lib/alankrit'
import { syncCloud } from './lib/cloud'

export interface Data {
  habits: Habit[]
  logs: Log[]
  misses: Miss[]
  settings: Record<string, unknown>
  ix: Index
  today: DayKey
  /** Ticks every 30s so Alankrit's live updates appear on time. */
  now: number
  rival: RivalMap
}

const DataContext = createContext<Data | null>(null)

/** Re-evaluates the clock as time passes (and when the app comes back to the foreground). */
function useNow(): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return now
}

export function DataProvider({ children }: { children: ReactNode }) {
  const now = useNow()
  const today = dayKeyOf(now)
  const habits = useLiveQuery(() => db.habits.orderBy('order').toArray())
  const logs = useLiveQuery(() => db.logs.toArray())
  const misses = useLiveQuery(() => db.misses.toArray())
  const settingRows = useLiveQuery(() => db.settings.toArray())
  const rivalRows = useLiveQuery(() => db.rival.toArray())

  const data = useMemo<Data | null>(() => {
    if (!habits || !logs || !misses || !settingRows || !rivalRows) return null
    const settings = Object.fromEntries(settingRows.map((s) => [s.key, s.value]))
    const startDay = typeof settings.startDay === 'string' && settings.startDay <= today ? settings.startDay : today
    const rival: RivalMap = new Map(rivalRows.map((r) => [r.day, r]))
    return { habits, logs, misses, settings, today, now, rival, ix: buildIndex(logs, startDay, today) }
  }, [habits, logs, misses, settingRows, rivalRows, today, now])

  useGithubAutoSync(data)
  useCloudAutoSync(data)

  // Lock in Alankrit's day as soon as it starts (and any days the app wasn't opened).
  const needsRival = data && !data.rival.has(data.today)
  useEffect(() => {
    if (needsRival && data) void ensureRivalDays(data.ix, data.habits)
  }, [needsRival, data])

  if (!data) return <div className="min-h-dvh bg-bg" />
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>
}

export function useData(): Data {
  const data = useContext(DataContext)
  if (!data) throw new Error('useData outside DataProvider')
  return data
}

function useGithubAutoSync(data: Data | null) {
  const user = data?.settings.githubUser as string | undefined
  const token = data?.settings.githubToken as string | undefined
  const startDay = data?.ix.startDay
  useEffect(() => {
    if (!user || !startDay) return
    const run = () => {
      if (document.visibilityState === 'visible') void syncGithub(user, token || undefined, startDay)
    }
    run()
    const id = setInterval(run, 10 * 60_000)
    document.addEventListener('visibilitychange', run)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', run)
    }
  }, [user, token, startDay])
}

/** Backs up to the cloud a few seconds after anything changes, and when the app returns to the foreground or comes back online. */
function useCloudAutoSync(data: Data | null) {
  const paired = !!data?.settings.cloudToken
  const logs = data?.logs
  const misses = data?.misses
  const habits = data?.habits
  useEffect(() => {
    if (!paired) return
    const id = setTimeout(() => void syncCloud(), 3000)
    return () => clearTimeout(id)
  }, [paired, logs, misses, habits])
  useEffect(() => {
    if (!paired) return
    const run = () => document.visibilityState === 'visible' && void syncCloud()
    document.addEventListener('visibilitychange', run)
    window.addEventListener('online', run)
    return () => {
      document.removeEventListener('visibilitychange', run)
      window.removeEventListener('online', run)
    }
  }, [paired])
}

/** Object URL for a stored photo, revoked when the component unmounts. */
export function usePhotoUrl(photoId: number | undefined, kind: 'thumb' | 'blob' = 'thumb'): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    setUrl(undefined)
    if (!photoId) return
    let objectUrl: string | undefined
    let cancelled = false
    void db.photos.get(photoId).then((p) => {
      if (cancelled || !p) return
      objectUrl = URL.createObjectURL(p[kind])
      setUrl(objectUrl)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [photoId, kind])
  return url
}
