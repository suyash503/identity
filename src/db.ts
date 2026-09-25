import Dexie, { type Table } from 'dexie'
import { dayKeyOf, type DayKey } from './lib/day'

export type Level = 'min' | 'full'
export type IconKey = 'gym' | 'dsa' | 'git' | 'torch'

export interface Habit {
  id: string
  name: string
  /** "I am someone who…" */
  identity: string
  color: string
  icon: IconKey
  minimum: string
  full: string
  /** 'github' habits are auto-sealed from pushes; the photo is optional. */
  verify: 'photo' | 'github'
  order: number
}

export interface Log {
  id?: number
  habitId: string
  day: DayKey
  level: Level
  photoId?: number
  caption?: string
  source: 'ritual' | 'github'
  at: number
}

export interface Photo {
  id?: number
  blob: Blob
  thumb: Blob
  w: number
  h: number
  at: number
}

export interface Miss {
  id?: number
  habitId: string
  day: DayKey
  /** Empty when skipped. */
  reasons: string[]
  at: number
}

/** Evening check-in: how the day felt, and when you fell asleep the night before. */
export interface CheckIn {
  day: DayKey
  /** 1 (drained) … 5 (charged) */
  energy?: number
  /** Minutes after the previous day's midnight, e.g. 1470 = 12:30 AM. */
  sleep?: number
  skipped?: boolean
  at: number
}

/** Alankrit's locked result for one day, per habit. */
export interface RivalResult {
  level: Level | null
  /** Minutes after that day's midnight (can pass 24h, a day ends at 4 AM). */
  minute: number
}

export interface RivalDay {
  day: DayKey
  results: Record<string, RivalResult>
}

export interface Setting {
  key: string
  value: unknown
}

export const DEFAULT_HABITS: Habit[] = [
  {
    id: 'gym',
    name: 'Gym',
    identity: 'I am someone who shows up to train.',
    color: '#5b9dff',
    icon: 'gym',
    minimum: 'Go to the gym and do the treadmill.',
    full: 'Complete a full workout.',
    verify: 'photo',
    order: 0,
  },
  {
    id: 'dsa',
    name: 'DSA',
    identity: 'I am someone who solves problems.',
    color: '#ffc53d',
    icon: 'dsa',
    minimum: 'Watch one lecture, then write one problem on my own.',
    full: 'Solve 2+ problems on LeetCode.',
    verify: 'photo',
    order: 1,
  },
  {
    id: 'git',
    name: 'GitHub',
    identity: 'I am someone who builds every day.',
    color: '#39d353',
    icon: 'git',
    minimum: 'Push one real commit.',
    full: 'Ship a meaningful chunk of work.',
    verify: 'github',
    order: 2,
  },
  {
    id: 'torch',
    name: 'PyTorch',
    identity: 'I am someone mastering deep learning.',
    color: '#ff7a45',
    icon: 'torch',
    minimum: 'Understand one PyTorch concept.',
    full: 'Implement the concept in code.',
    verify: 'photo',
    order: 3,
  },
]

class IdentityDB extends Dexie {
  habits!: Table<Habit, string>
  logs!: Table<Log, number>
  photos!: Table<Photo, number>
  misses!: Table<Miss, number>
  settings!: Table<Setting, string>
  rival!: Table<RivalDay, string>
  checkins!: Table<CheckIn, string>

  constructor() {
    super('identity')
    this.version(1).stores({
      habits: 'id, order',
      logs: '++id, &[habitId+day], day, habitId',
      photos: '++id, at',
      misses: '++id, &[habitId+day], day',
      settings: 'key',
      rival: 'day',
    })
    this.version(2).stores({ checkins: 'day' })
    this.on('populate', (tx) => {
      tx.table('habits').bulkAdd(DEFAULT_HABITS)
      tx.table('settings').add({ key: 'startDay', value: dayKeyOf() })
    })
  }
}

export const db = new IdentityDB()

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value })
}
