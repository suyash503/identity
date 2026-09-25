import { useState } from 'react'
import { Moon } from 'lucide-react'
import { db } from '../db'
import { useData } from '../data'
import { ENERGY_LABELS, SLEEP_OPTIONS } from '../lib/insights'
import { fmtDay } from '../lib/day'
import { Eyebrow, Sheet } from './ui'

/** Two taps: how the day felt, and when you fell asleep last night. Feeds the sleep and energy patterns. */
export function EveningCheckin({ onDone }: { onDone: () => void }) {
  const { today, checkins } = useData()
  const existing = checkins.get(today)
  const [energy, setEnergy] = useState<number | undefined>(existing?.energy)
  const [sleep, setSleep] = useState<number | undefined>(existing?.sleep)

  const save = async (skipped = false) => {
    await db.checkins.put(skipped ? { day: today, skipped: true, at: Date.now() } : { day: today, energy, sleep, at: Date.now() })
    onDone()
  }

  return (
    <Sheet label="Evening check-in" onClose={onDone}>
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-surface-2 text-ghost">
          <Moon size={22} aria-hidden />
        </div>
        <div>
          <Eyebrow>{fmtDay(today, { weekday: 'long', day: 'numeric', month: 'short' })}</Eyebrow>
          <h2 className="mt-1 font-display text-[28px] font-bold uppercase leading-none">Evening check-in</h2>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-[15px] font-medium">Energy today</div>
        <div className="mt-2 grid grid-cols-5 gap-2" role="radiogroup" aria-label="Energy today">
          {ENERGY_LABELS.map((label, i) => {
            const v = i + 1
            const on = energy === v
            return (
              <button
                key={label}
                role="radio"
                aria-checked={on}
                onClick={() => setEnergy(v)}
                className={`flex h-16 flex-col items-center justify-center rounded-2xl border transition-colors ${on ? 'border-ink bg-ink text-black' : 'border-line bg-surface-2 text-ink'}`}
              >
                <span className="font-display text-2xl font-bold leading-none">{v}</span>
                <span className={`mt-1 text-[11px] ${on ? 'text-black/70' : 'text-ink-3'}`}>{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-6">
        <div className="text-[15px] font-medium">Last night you fell asleep</div>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Last night you fell asleep">
          {SLEEP_OPTIONS.map((o) => {
            const on = sleep === o.value
            return (
              <button
                key={o.label}
                role="radio"
                aria-checked={on}
                onClick={() => setSleep(o.value)}
                className={`h-11 rounded-full border px-4 text-[15px] transition-colors ${on ? 'border-ink bg-ink font-semibold text-black' : 'border-line bg-surface-2 text-ink'}`}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-7 flex gap-3">
        <button onClick={() => save(true)} className="h-14 flex-1 rounded-full border border-line font-display text-base font-bold uppercase tracking-[0.14em] text-ink-2">
          Skip
        </button>
        <button
          onClick={() => save()}
          disabled={energy === undefined && sleep === undefined}
          className="h-14 flex-[2] rounded-full bg-ink font-display text-base font-bold uppercase tracking-[0.14em] text-black disabled:opacity-30"
        >
          Save
        </button>
      </div>
    </Sheet>
  )
}
