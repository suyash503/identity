import { useState } from 'react'
import { db, type Habit } from '../db'
import { useData } from '../data'
import { relativeDay, type DayKey } from '../lib/day'
import { Eyebrow, IconTile, Sheet } from './ui'

export const REASONS = ['Tired', 'Slept late', 'Phone / scrolling', 'Stressed', 'No plan', 'College / busy', 'Social plans', 'Sick', 'Forgot', 'Other']

export interface MissItem {
  habit: Habit
  day: DayKey
}

/** "What got in the way?" — asked once per miss. These answers are how triggers get found. */
export function MissCheckin({ items, onDone }: { items: MissItem[]; onDone: () => void }) {
  const { today } = useData()
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<string[]>([])
  const item = items[index]

  const save = async (reasons: string[]) => {
    await db.misses.put({ habitId: item.habit.id, day: item.day, reasons, at: Date.now() })
    setPicked([])
    if (index + 1 < items.length) setIndex(index + 1)
    else onDone()
  }

  const toggle = (r: string) => setPicked((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]))

  return (
    <Sheet label="Miss check-in" onClose={onDone}>
      <div className="flex items-center gap-3">
        <IconTile habit={item.habit} size={44} />
        <div>
          <Eyebrow>
            {relativeDay(item.day, today)} · {items.length > 1 ? `${index + 1} of ${items.length}` : 'one miss'}
          </Eyebrow>
          <h2 className="mt-1 font-display text-[28px] font-bold uppercase leading-none">{item.habit.name} slipped</h2>
        </div>
      </div>
      <p className="mt-4 text-[15px] text-ink-2">What got in the way? Misses are data, not guilt.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {REASONS.map((r) => {
          const on = picked.includes(r)
          return (
            <button
              key={r}
              onClick={() => toggle(r)}
              aria-pressed={on}
              className={`h-11 rounded-full border px-4 text-[15px] transition-colors ${on ? 'border-ink bg-ink font-semibold text-black' : 'border-line bg-surface-2 text-ink'}`}
            >
              {r}
            </button>
          )
        })}
      </div>

      <div className="mt-6 flex gap-3">
        <button onClick={() => save([])} className="h-14 flex-1 rounded-full border border-line font-display text-base font-bold uppercase tracking-[0.14em] text-ink-2">
          Skip
        </button>
        <button
          onClick={() => save(picked)}
          disabled={picked.length === 0}
          className="h-14 flex-[2] rounded-full bg-ink font-display text-base font-bold uppercase tracking-[0.14em] text-black disabled:opacity-30"
        >
          Log it
        </button>
      </div>
    </Sheet>
  )
}
