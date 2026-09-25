import { motion } from 'motion/react'
import { Camera, Check, GitCommitHorizontal, TriangleAlert } from 'lucide-react'
import type { Habit } from '../db'
import { useData, usePhotoUrl } from '../data'
import { alertOf, chainOf, isKept, logOf, missRun, statusOf } from '../lib/stats'
import { BattleBadge, RivalChip } from './Rival'
import { ChainBadge, CommitPattern, DANGER, DayDots, HabitIcon, IconTile, LevelBadge, tint } from './ui'

export function HabitCard({ habit, onOpen }: { habit: Habit; onOpen: () => void }) {
  const { ix, settings } = useData()
  const status = statusOf(ix, habit.id, ix.today)
  const chain = chainOf(ix, habit.id)

  if (isKept(status)) return <SealedCard habit={habit} onOpen={onOpen} />

  const alert = alertOf(ix, habit.id)
  const accent = alert === 'none' ? habit.color : DANGER
  const isGit = habit.verify === 'github'

  return (
    <motion.button
      layout
      layoutId={`card-${habit.id}`}
      onClick={onOpen}
      whileTap={{ scale: 0.98 }}
      className={`relative w-full overflow-hidden rounded-[28px] border bg-surface p-5 text-left ${alert === 'none' ? 'border-line' : 'animate-danger-pulse border-transparent'}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 size-56 rounded-full opacity-[0.18] blur-3xl"
        style={{ background: accent }}
      />

      {alert !== 'none' && (
        <div className="relative mb-4 flex items-center gap-2 font-display text-[13px] font-bold uppercase tracking-[0.18em] text-danger">
          <TriangleAlert size={16} strokeWidth={2.5} aria-hidden />
          {alert === 'danger' ? 'Danger day · missed yesterday' : `${missRun(ix, habit.id)} days missed · your ghost is gaining`}
        </div>
      )}

      <div className="relative flex items-center gap-4">
        <IconTile habit={habit} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-[30px] font-bold uppercase leading-none tracking-wide">{habit.name}</div>
          <div className="mt-1.5 truncate text-[14px] text-ink-2">{habit.identity}</div>
        </div>
        <ChainBadge {...chain} />
      </div>

      <div className="relative mt-4 rounded-2xl bg-surface-2 px-4 py-3">
        <div className="font-display text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: tint(accent, 85) }}>
          {alert === 'none' ? 'Bare minimum' : "Don't miss twice · do just this"}
        </div>
        <div className="mt-1 text-[15px] leading-snug text-ink">{habit.minimum}</div>
      </div>

      <div className="relative mt-4 flex items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <DayDots ix={ix} habit={habit} />
          <RivalChip habit={habit} />
        </div>
        {isGit && !settings.githubUser ? (
          <span className="text-[13px] text-ink-3">Connect GitHub in settings</span>
        ) : isGit ? (
          <span className="flex items-center gap-1.5 text-[13px] text-ink-2">
            <GitCommitHorizontal size={16} aria-hidden style={{ color: habit.color }} />
            Auto-seals on push
          </span>
        ) : (
          <span
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 font-display text-[15px] font-bold uppercase tracking-[0.1em] text-black"
            style={{ background: accent }}
          >
            <Camera size={17} strokeWidth={2.5} aria-hidden />
            {alert === 'none' ? 'Seal it' : 'Just the minimum'}
          </span>
        )}
      </div>
    </motion.button>
  )
}

function SealedCard({ habit, onOpen }: { habit: Habit; onOpen: () => void }) {
  const { ix } = useData()
  const log = logOf(ix, habit.id, ix.today)!
  const url = usePhotoUrl(log.photoId)
  const chain = chainOf(ix, habit.id)

  return (
    <motion.button
      layout
      layoutId={`card-${habit.id}`}
      onClick={onOpen}
      whileTap={{ scale: 0.98 }}
      className="relative h-44 w-full overflow-hidden rounded-[28px] bg-surface text-left"
    >
      {url ? (
        <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <CommitPattern color={habit.color} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/5" />
      <div className="relative flex h-full flex-col justify-between p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full text-black" style={{ background: habit.color }}>
              <Check size={16} strokeWidth={3.5} aria-hidden />
            </span>
            <LevelBadge level={log.level} color={habit.color} />
          </div>
          <div className="flex items-center gap-3">
            <BattleBadge habit={habit} />
            <ChainBadge {...chain} compact />
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2" style={{ color: habit.color }}>
            <HabitIcon habit={habit} size={22} />
            <span className="font-display text-[30px] font-bold uppercase leading-none tracking-wide text-ink">{habit.name}</span>
          </div>
          <div className="mt-1.5 truncate text-[14px] text-ink-2">
            {log.caption || (log.source === 'github' && !log.photoId ? 'Verified by your GitHub pushes' : habit.identity)}
          </div>
        </div>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[28px]" style={{ boxShadow: `inset 0 0 0 1.5px ${tint(habit.color, 55)}` }} />
    </motion.button>
  )
}
