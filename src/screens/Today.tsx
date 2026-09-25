import { motion } from 'motion/react'
import { Ghost, Settings2 } from 'lucide-react'
import type { Habit } from '../db'
import { useData } from '../data'
import { HabitCard } from '../components/HabitCard'
import { RivalCard } from '../components/Rival'
import { Eyebrow, GHOST, SectionLabel, tint } from '../components/ui'
import { fmtDay } from '../lib/day'
import { alertOf, dayNumber, isKept, raceOf, statusOf } from '../lib/stats'

export function Today({ onOpenHabit, onOpenSettings, onOpenFeed }: { onOpenHabit: (h: Habit) => void; onOpenSettings: () => void; onOpenFeed: () => void }) {
  const { habits, ix } = useData()

  const danger = habits.filter((h) => alertOf(ix, h.id) !== 'none')
  const sealed = habits.filter((h) => isKept(statusOf(ix, h.id, ix.today)))
  const open = habits.filter((h) => !danger.includes(h) && !sealed.includes(h))

  const tagline =
    sealed.length === habits.length
      ? 'Every identity sealed. That’s who you are.'
      : danger.length
        ? 'One miss is an accident. Two is a pattern. Not today.'
        : 'Do the bare minimum. It’s who you are.'

  return (
    <div className="px-5">
      <header className="flex items-center justify-between pt-[calc(env(safe-area-inset-top)+14px)]">
        <Wordmark />
        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          className="grid size-11 place-items-center rounded-full border border-line bg-surface text-ink-2 active:bg-surface-2"
        >
          <Settings2 size={20} />
        </button>
      </header>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-8">
        <Eyebrow>{fmtDay(ix.today, { weekday: 'long', day: 'numeric', month: 'long' })}</Eyebrow>
        <h1 className="mt-1 font-display text-[92px] font-extrabold uppercase leading-[0.82] tracking-tight">
          Day <span className="tabular-nums">{dayNumber(ix)}</span>
        </h1>
        <p className="mt-4 text-[16px] text-ink-2">{tagline}</p>
      </motion.div>

      <TodayHero />

      <div className="mt-3">
        <RivalCard onOpen={onOpenFeed} />
      </div>

      {danger.length > 0 && (
        <>
          <SectionLabel color="var(--color-danger)">Don’t miss twice</SectionLabel>
          <CardList habits={danger} onOpen={onOpenHabit} />
        </>
      )}
      {open.length > 0 && (
        <>
          <SectionLabel>Today</SectionLabel>
          <CardList habits={open} onOpen={onOpenHabit} />
        </>
      )}
      {sealed.length > 0 && (
        <>
          <SectionLabel>Sealed</SectionLabel>
          <CardList habits={sealed} onOpen={onOpenHabit} />
        </>
      )}
      <p className="mb-6 mt-10 text-center text-[13px] text-ink-3">Days end at 4 AM. Late nights count for today.</p>
    </div>
  )
}

function CardList({ habits, onOpen }: { habits: Habit[]; onOpen: (h: Habit) => void }) {
  return (
    <div className="space-y-3">
      {habits.map((h) => (
        <HabitCard key={h.id} habit={h} onOpen={() => onOpen(h)} />
      ))}
    </div>
  )
}

function TodayHero() {
  const { habits, ix } = useData()
  const kept = habits.filter((h) => isKept(statusOf(ix, h.id, ix.today))).length
  const race = raceOf(ix, habits.map((h) => h.id), 7)
  const ahead = race.lead >= 0

  return (
    <section className="relative mt-8 overflow-hidden rounded-[32px] border border-line bg-surface p-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Eyebrow>Kept today</Eyebrow>
          <div className="mt-2 font-display text-[64px] font-extrabold leading-none tabular-nums">
            {kept}
            <span className="text-ink-3">/{habits.length}</span>
          </div>
        </div>
        <div className="pb-1 text-right">
          <div className="flex items-center justify-end gap-1.5 font-display text-[32px] font-bold leading-none tabular-nums" style={{ color: ahead ? GHOST : 'var(--color-danger)' }}>
            <Ghost size={22} aria-hidden />
            {ahead ? `+${race.lead}` : race.lead}
          </div>
          <div className="mt-1.5 text-[13px] text-ink-3">{ahead ? 'ahead of last-week you' : 'behind last-week you'}</div>
        </div>
      </div>
      <div className="mt-5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${habits.length}, 1fr)` }}>
        {habits.map((h) => {
          const s = statusOf(ix, h.id, ix.today)
          return (
            <motion.div
              key={h.id}
              className="h-2.5 rounded-full"
              initial={false}
              animate={{
                background: s === 'full' ? h.color : s === 'min' ? tint(h.color, 55) : 'var(--color-surface-3)',
                boxShadow: s === 'full' ? `0 0 14px -2px ${h.color}` : '0 0 0 0 transparent',
              }}
              aria-label={`${h.name}: ${s === 'full' ? 'full' : s === 'min' ? 'minimum' : 'not yet'}`}
            />
          )
        })}
      </div>
    </section>
  )
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="size-7" aria-hidden>
        <rect x="30" y="8" width="14" height="36" rx="2" fill={GHOST} opacity=".3" />
        <rect x="24" y="8" width="14" height="36" rx="2" fill="#f5f5f7" />
        <rect x="14" y="50" width="8" height="8" rx="1.5" fill="#5b9dff" />
        <rect x="25" y="50" width="8" height="8" rx="1.5" fill="#ffc53d" />
        <rect x="36" y="50" width="8" height="8" rx="1.5" fill="#39d353" />
        <rect x="47" y="50" width="8" height="8" rx="1.5" fill="#ff7a45" />
      </svg>
      <span className="font-display text-[17px] font-bold tracking-[0.32em]">IDENTITY</span>
    </div>
  )
}
