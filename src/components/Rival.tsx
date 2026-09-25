import { motion } from 'motion/react'
import { ChevronRight } from 'lucide-react'
import type { Habit } from '../db'
import { useData } from '../data'
import { RIVAL, battle, rivalStatus, scoreIn, taunt, todayFeed, weekStart } from '../lib/alankrit'
import { fmtMinute } from '../lib/day'
import { Eyebrow, HabitIcon, RivalAvatar, Sheet, tint } from './ui'

export function RivalCard({ onOpen }: { onOpen: () => void }) {
  const { ix, rival, habits, now } = useData()
  const ids = habits.map((h) => h.id)
  const today = scoreIn(ix, rival, ids, ix.today, ix.today, now)
  const week = scoreIn(ix, rival, ids, weekStart(ix.today), ix.today, now)
  const latest = todayFeed(ix, rival, habits, now).find((f) => f.who === 'rival')

  return (
    <motion.button
      onClick={onOpen}
      whileTap={{ scale: 0.98 }}
      className="relative w-full overflow-hidden rounded-[28px] border border-line bg-surface p-5 text-left"
    >
      <div aria-hidden className="pointer-events-none absolute -left-16 -top-20 size-56 rounded-full opacity-[0.16] blur-3xl" style={{ background: RIVAL.color }} />
      <div className="relative flex items-center gap-3">
        <RivalAvatar />
        <div className="min-w-0 flex-1">
          <div className="font-display text-[22px] font-bold uppercase leading-none tracking-wide">{RIVAL.name}</div>
          <div className="mt-1 text-[13px] text-ink-3">
            Your rival · week {week.you}–{week.him}
          </div>
        </div>
        <div className="text-right">
          <Eyebrow>Today</Eyebrow>
          <div className="mt-0.5 font-display text-[34px] font-extrabold leading-none tabular-nums" aria-label={`Today: you ${today.you}, ${RIVAL.name} ${today.him}`}>
            {today.you}
            <span className="mx-1 text-ink-3">–</span>
            <span style={{ color: RIVAL.color }}>{today.him}</span>
          </div>
        </div>
      </div>

      <div className="relative mt-4 rounded-2xl rounded-tl-md px-4 py-3 text-[15px] leading-snug" style={{ background: tint(RIVAL.color, 10) }}>
        “{taunt(ix, rival, habits, now)}”
      </div>

      <div className="relative mt-3 flex items-center justify-between gap-3 text-[13px] text-ink-2">
        <span className="min-w-0 truncate">
          {latest ? `${fmtMinute(latest.minute)} · ${latest.text}` : `${RIVAL.name} hasn’t made a move yet.`}
        </span>
        <span className="flex shrink-0 items-center font-semibold text-ink">
          Live feed <ChevronRight size={16} aria-hidden />
        </span>
      </div>
    </motion.button>
  )
}

/** Alankrit's status for one habit today, shown on each habit card. */
export function RivalChip({ habit }: { habit: Habit }) {
  const { ix, rival, now } = useData()
  const s = rivalStatus(rival, habit.id, ix.today, ix, now)
  const res = rival.get(ix.today)?.results[habit.id]
  const text = s === 'pending' ? 'not yet' : s === 'missed' ? 'skipped' : `${s === 'full' ? 'full' : 'minimum'} · ${fmtMinute(res!.minute)}`
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
      <RivalAvatar size={16} />
      <span>
        <span className="sr-only">{RIVAL.name}: </span>
        {text}
      </span>
    </span>
  )
}

/** Win / draw / loss against Alankrit for a habit today. */
export function BattleBadge({ habit }: { habit: Habit }) {
  const { ix, rival, now } = useData()
  const o = battle(ix, rival, habit.id, ix.today, now)
  const label = o === 'win' ? 'Beating Alankrit' : o === 'draw' ? 'Tied' : 'Alankrit ahead'
  const color = o === 'win' ? habit.color : o === 'draw' ? 'var(--color-ink-2)' : RIVAL.color
  return (
    <span className="rounded-full bg-black/50 px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color }}>
      {label}
    </span>
  )
}

export function RivalFeed({ onClose }: { onClose: () => void }) {
  const { ix, rival, habits, now } = useData()
  const feed = todayFeed(ix, rival, habits, now)
  const waiting = habits.filter((h) => rivalStatus(rival, h.id, ix.today, ix, now) === 'pending')

  return (
    <Sheet label={`${RIVAL.name} live feed`} onClose={onClose}>
      <div className="flex items-center gap-3">
        <RivalAvatar size={40} />
        <div>
          <div className="font-display text-2xl font-bold uppercase leading-none">Live feed</div>
          <div className="mt-1 text-[13px] text-ink-3">You vs {RIVAL.name}, today</div>
        </div>
      </div>

      <ol className="no-scrollbar mt-5 max-h-[52dvh] space-y-1 overflow-y-auto">
        {feed.length === 0 && <li className="py-8 text-center text-ink-3">Nothing yet. First move wins the morning.</li>}
        {feed.map((f) => (
          <li key={f.key} className="flex gap-3 rounded-2xl px-2 py-3">
            <div className="w-16 shrink-0 pt-0.5 text-right font-display text-sm font-semibold tabular-nums text-ink-3">{fmtMinute(f.minute)}</div>
            <div className="relative flex flex-col items-center">
              <span className="mt-1.5 size-2.5 rounded-full" style={{ background: f.who === 'rival' ? RIVAL.color : f.habit.color }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-display text-[13px] font-bold uppercase tracking-[0.16em]" style={{ color: f.who === 'rival' ? RIVAL.color : f.habit.color }}>
                {f.who === 'rival' ? RIVAL.name : 'You'}
                <span className="text-ink-3">·</span>
                <HabitIcon habit={f.habit} size={14} className="text-ink-3" />
                <span className="text-ink-3">{f.habit.name}</span>
              </div>
              <p className={`mt-0.5 text-[15px] leading-snug ${f.who === 'rival' ? 'text-ink' : 'text-ink-2'}`}>
                {f.who === 'rival' ? `“${f.text}”` : f.text}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {waiting.length > 0 && (
        <div className="mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-[14px] text-ink-2">
          Still to come from {RIVAL.name}: {waiting.map((h) => h.name).join(', ')}
        </div>
      )}
    </Sheet>
  )
}
