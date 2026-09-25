import { db, setSetting } from '../db'
import { dayKeyOf, type DayKey } from './day'

export interface GithubSyncState {
  at: number
  error?: string
  pushesToday?: number
}

interface GithubEvent {
  type: string
  created_at: string
}

/** Push events per day from the last ~90 days of GitHub activity. */
export async function fetchPushDays(user: string, token?: string): Promise<Map<DayKey, number>> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(user)}/events?per_page=100`, {
    headers,
    cache: 'no-store',
  })
  if (!res.ok) {
    if (res.status === 404) throw new Error(`No GitHub user "${user}"`)
    if (res.status === 401) throw new Error('GitHub token rejected')
    if (res.status === 403) throw new Error('GitHub rate limit hit, try again later')
    throw new Error(`GitHub error ${res.status}`)
  }
  const events = (await res.json()) as GithubEvent[]
  const days = new Map<DayKey, number>()
  for (const e of events) {
    if (e.type !== 'PushEvent') continue
    const d = dayKeyOf(new Date(e.created_at))
    days.set(d, (days.get(d) ?? 0) + 1)
  }
  return days
}

/** Seals the GitHub habit (at minimum) on every day since day 1 that has a push. Never touches ritual logs. */
export async function syncGithub(user: string, token: string | undefined, startDay: DayKey) {
  try {
    const days = await fetchPushDays(user, token)
    await db.transaction('rw', db.logs, async () => {
      for (const [day] of days) {
        if (day < startDay) continue
        const existing = await db.logs.where({ habitId: 'git', day }).first()
        if (!existing) await db.logs.add({ habitId: 'git', day, level: 'min', source: 'github', at: Date.now() })
      }
    })
    await setSetting('githubSync', { at: Date.now(), pushesToday: days.get(dayKeyOf()) ?? 0 } satisfies GithubSyncState)
  } catch (e) {
    await setSetting('githubSync', { at: Date.now(), error: (e as Error).message } satisfies GithubSyncState)
  }
}
