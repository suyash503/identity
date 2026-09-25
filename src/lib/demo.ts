// Dev-only: fills the database with ~75 days of believable history so every screen can be checked.
import { db, type Habit, type Level } from '../db'
import { addDays, dayKeyOf, diffDays, rangeKeys, weekdayIndex, type DayKey } from './day'
import { processPhoto } from './image'

const DEMO_REASONS = ['Tired', 'Slept late', 'Slept late', 'Phone / scrolling', 'Phone / scrolling', 'No plan', 'College / busy', 'Stressed']

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TYPICAL_MINUTE: Record<string, number> = { gym: 7 * 60, dsa: 21 * 60, git: 23 * 60, torch: 16 * 60 }

function atFor(day: DayKey, habitId: string, jitter: number) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).getTime() + (TYPICAL_MINUTE[habitId] + jitter) * 60_000
}

async function fakePhoto(habit: Habit, day: DayKey, r: () => number) {
  const c = document.createElement('canvas')
  c.width = 900
  c.height = 1200
  const g = c.getContext('2d')!
  g.fillStyle = '#0a0a0d'
  g.fillRect(0, 0, 900, 1200)
  const glow = g.createRadialGradient(200 + r() * 500, 300 + r() * 600, 20, 450, 600, 900)
  glow.addColorStop(0, habit.color)
  glow.addColorStop(0.45, `${habit.color}55`)
  glow.addColorStop(1, '#0a0a0d')
  g.fillStyle = glow
  g.fillRect(0, 0, 900, 1200)
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.06})`
    g.beginPath()
    g.arc(r() * 900, r() * 1200, 30 + r() * 180, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = 'rgba(0,0,0,.35)'
  g.font = '800 260px "Barlow Condensed"'
  g.save()
  g.translate(80, 1100)
  g.rotate(-Math.PI / 2)
  g.fillText(habit.name.toUpperCase(), 0, 0)
  g.restore()
  g.fillStyle = 'rgba(255,255,255,.8)'
  g.font = '600 44px "Barlow Condensed"'
  g.fillText(day, 520, 1140)
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.9))
  return processPhoto(blob)
}

export async function loadDemo() {
  const r = seeded(42)
  const today = dayKeyOf()
  const start = addDays(today, -74)
  const habits = await db.habits.toArray()
  await Promise.all([db.logs.clear(), db.photos.clear(), db.misses.clear(), db.rival.clear()])
  await db.settings.put({ key: 'startDay', value: start })

  const days = rangeKeys(start, addDays(today, -1))
  for (const [i, day] of days.entries()) {
    const back = diffDays(today, day)
    for (const h of habits) {
      let p = 0.5 + (i / days.length) * 0.35
      if (h.id === 'gym' && weekdayIndex(day) === 3) p -= 0.4 // weak Thursdays
      if (h.id === 'torch') p -= 0.15 // the irregular one
      let kept = r() < p
      // Script the last few days so danger / broken states are visible.
      if (h.id === 'dsa' && back <= 2) kept = back === 2
      if (h.id === 'torch' && back <= 2) kept = false
      if (h.id === 'gym' && back <= 3) kept = true

      if (kept) {
        const level: Level = r() < 0.3 ? 'full' : 'min'
        const isGitAuto = h.verify === 'github' && r() < 0.7
        let photoId: number | undefined
        if (!isGitAuto && back <= 21) {
          const p = await fakePhoto(h, day, r)
          photoId = await db.photos.add({ ...p, at: atFor(day, h.id, 0) })
        }
        await db.logs.add({
          habitId: h.id,
          day,
          level: isGitAuto ? 'min' : level,
          photoId,
          source: isGitAuto ? 'github' : 'ritual',
          at: atFor(day, h.id, Math.round((r() - 0.5) * 90)),
        })
      } else if (back > 3 && r() < 0.8) {
        const n = 1 + Math.floor(r() * 2)
        const reasons = [...new Set(Array.from({ length: n }, () => DEMO_REASONS[Math.floor(r() * DEMO_REASONS.length)]))]
        await db.misses.add({ habitId: h.id, day, reasons, at: Date.now() })
      }
    }
  }

  // Today: gym already done at 7 AM, full.
  const gym = habits.find((h) => h.id === 'gym')!
  const p = await fakePhoto(gym, today, r)
  const photoId = await db.photos.add({ ...p, at: Date.now() })
  await db.logs.add({ habitId: 'gym', day: today, level: 'full', photoId, caption: 'Legs day. Survived.', source: 'ritual', at: atFor(today, 'gym', 12) })
  // The app may have generated Alankrit's days from half-written history while this ran; start him fresh.
  await db.rival.clear()
}

export async function resetAll() {
  await db.delete()
  location.reload()
}
