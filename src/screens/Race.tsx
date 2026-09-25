import { useState } from 'react'
import { motion } from 'motion/react'
import { Ghost, Trophy } from 'lucide-react'
import type { Habit } from '../db'
import { useData } from '../data'
import { Eyebrow, GHOST, HabitIcon, RivalAvatar, SectionLabel, Segmented, statusStyle } from '../components/ui'
import { REASONS } from '../components/MissCheckin'
import { addDays, fmtDay, rangeKeys, weekdayIndex } from '../lib/day'
import { PERIODS, keptIn, longestChain, raceOf, reasonCounts, statusOf } from '../lib/stats'
import { RIVAL, monthStart, pastSeasons, scoreIn, weekStart, type Score } from '../lib/alankrit'

type Opponent = 'ghost' | 'rival'

export function Race() {
  const [opponent, setOpponent] = useState<Opponent>('ghost')
  return (
    <div className="px-5 pt-[calc(env(safe-area-inset-top)+28px)]">
      <h1 className="font-display text-[64px] font-extrabold uppercase leading-[0.85] tracking-tight">Race</h1>
      <p className="mt-3 text-ink-2">{opponent === 'ghost' ? 'You vs the person you were.' : `You vs ${RIVAL.name}. Every habit, every day.`}</p>
      <div className="mt-6">
        <Segmented<Opponent>
          id="opponent"
          value={opponent}
          onChange={setOpponent}
          options={[
            { value: 'ghost', label: 'Ghost' },
            { value: 'rival', label: RIVAL.name },
          ]}
        />
      </div>
      {opponent === 'ghost' ? <GhostView /> : <RivalView />}
      <div className="h-8" />
    </div>
  )
}

// ── Ghost ──

function GhostView() {
  const { habits, ix, misses, logs } = useData()
  const [periodIdx, setPeriodIdx] = useState(0)
  const period = PERIODS[periodIdx]
  const ids = habits.map((h) => h.id)
  const overall = raceOf(ix, ids, period.days)
  const ahead = overall.lead >= 0
  const reasons = reasonCounts(misses)
  const periodFull = keptIn(ix, ids, addDays(ix.today, -(period.days - 1)), ix.today).full

  return (
    <>
      <div className="mt-3">
        <Segmented<number> id="period" value={periodIdx} onChange={setPeriodIdx} options={PERIODS.map((p, i) => ({ value: i, label: p.label }))} />
      </div>

      <section className="mt-5 rounded-[32px] border border-line bg-surface p-5">
        <div className="flex items-end gap-3">
          <motion.div
            key={`${period.days}-${overall.lead}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-[88px] font-extrabold leading-[0.8] tabular-nums"
            style={{ color: ahead ? 'var(--color-ink)' : 'var(--color-danger)' }}
          >
            {ahead ? `+${overall.lead}` : overall.lead}
          </motion.div>
          <div className="pb-1 text-[15px] leading-snug text-ink-2">
            {ahead ? 'votes ahead of' : 'votes behind'}
            <br />
            <span className="text-ink">{period.ghostName}</span>
          </div>
        </div>
        <div className="mt-6">
          <Track you={overall.you} ghost={overall.ghost} max={overall.max} color="#f5f5f7" />
        </div>
        <div className="mt-3 flex justify-between text-[13px] text-ink-3">
          <span>
            You <span className="font-semibold text-ink tabular-nums">{overall.you}</span>
          </span>
          <span>
            Ghost <span className="font-semibold tabular-nums" style={{ color: GHOST }}>{overall.ghost}</span>
          </span>
        </div>
        {overall.ghostForming && (
          <p className="mt-4 rounded-2xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
            Your ghost is still forming. Days before Day 1 count as zero for it, so beat it by a lot.
          </p>
        )}
      </section>

      <SectionLabel>Per identity</SectionLabel>
      <div className="space-y-3">
        {habits.map((h) => {
          const r = raceOf(ix, [h.id], period.days)
          return (
            <div key={h.id} className="rounded-[24px] border border-line bg-surface px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2" style={{ color: h.color }}>
                  <HabitIcon habit={h} size={18} />
                  <span className="font-display text-xl font-bold uppercase tracking-wide text-ink">{h.name}</span>
                </div>
                <div className="font-display text-lg font-bold tabular-nums">
                  {r.you} <span className="text-ink-3">vs</span> <span style={{ color: GHOST }}>{r.ghost}</span>
                </div>
              </div>
              <div className="mt-3">
                <Track you={r.you} ghost={r.ghost} max={r.max} color={h.color} small />
              </div>
            </div>
          )
        })}
      </div>

      <SectionLabel>Consistency · 16 weeks</SectionLabel>
      <div className="space-y-3">
        {habits.map((h) => (
          <Heatmap key={h.id} habit={h} />
        ))}
        <Legend />
      </div>

      <SectionLabel>Numbers</SectionLabel>
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Best chain" value={Math.max(0, ...habits.map((h) => longestChain(ix, h.id)))} />
        <StatTile label={`Full · ${period.label.toLowerCase()}`} value={periodFull} />
        <StatTile label="Rituals" value={logs.filter((l) => l.photoId).length} />
      </div>

      <SectionLabel>What gets in the way</SectionLabel>
      {reasons.length === 0 ? (
        <p className="rounded-[24px] border border-line bg-surface px-5 py-4 text-[14px] text-ink-3">
          No misses logged yet. When you miss, the app asks why, and your patterns show up here.
        </p>
      ) : (
        <div className="space-y-2 rounded-[24px] border border-line bg-surface p-5">
          {reasons.slice(0, REASONS.length).map(([r, n]) => (
            <div key={r} className="flex items-center gap-3">
              <div className="w-32 shrink-0 truncate text-[14px] text-ink-2">{r}</div>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                <motion.div
                  className="h-full rounded-full bg-danger/80"
                  initial={{ width: 0 }}
                  animate={{ width: `${(n / reasons[0][1]) * 100}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
              <div className="w-6 text-right font-display font-bold tabular-nums">{n}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function Track({ you, ghost, max, color, small }: { you: number; ghost: number; max: number; color: string; small?: boolean }) {
  const pct = (v: number) => `${max ? (v / max) * 100 : 0}%`
  const dot = small ? 'size-5' : 'size-7'
  return (
    <div className={`relative mx-3 ${small ? 'h-6' : 'h-9'}`} role="img" aria-label={`You ${you}, ghost ${ghost}, out of ${max}`}>
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-3" />
      <motion.div
        className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: pct(you) }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      />
      <motion.div
        className={`absolute top-1/2 grid ${dot} -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-dashed`}
        style={{ borderColor: GHOST, background: 'rgb(185 180 234 / .12)', color: GHOST }}
        initial={{ left: 0 }}
        animate={{ left: pct(ghost) }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      >
        <Ghost size={small ? 11 : 15} aria-hidden />
      </motion.div>
      <motion.div
        className={`absolute top-1/2 ${dot} -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-black`}
        style={{ background: color, boxShadow: `0 0 16px -2px ${color}` }}
        initial={{ left: 0 }}
        animate={{ left: pct(you) }}
        transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.05 }}
      />
    </div>
  )
}

function Heatmap({ habit }: { habit: Habit }) {
  const { ix } = useData()
  const weeks = 16
  const start = addDays(ix.today, -((weeks - 1) * 7 + weekdayIndex(ix.today)))
  const days = rangeKeys(start, addDays(start, weeks * 7 - 1))
  return (
    <div className="rounded-[24px] border border-line bg-surface p-4">
      <div className="mb-3 flex items-center gap-2" style={{ color: habit.color }}>
        <HabitIcon habit={habit} size={16} />
        <span className="font-display text-base font-bold uppercase tracking-wide text-ink">{habit.name}</span>
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-[3px]" aria-label={`${habit.name}, last ${weeks} weeks`}>
        {days.map((d) => (
          <div key={d} className="aspect-square rounded-[3px]" style={d > ix.today ? { opacity: 0 } : statusStyle(statusOf(ix, habit.id, d), habit.color)} title={d} />
        ))}
      </div>
    </div>
  )
}

function Legend() {
  const c = '#a8a8b3'
  return (
    <div className="flex flex-wrap gap-4 px-1 text-[12px] text-ink-3">
      {(
        [
          ['full', 'Full'],
          ['min', 'Minimum'],
          ['missed', 'Missed'],
          ['none', 'Before day 1'],
        ] as const
      ).map(([s, label]) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px]" style={statusStyle(s, c)} />
          {label}
        </span>
      ))}
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[22px] border border-line bg-surface px-4 py-4">
      <div className="font-display text-[40px] font-extrabold leading-none tabular-nums">{value}</div>
      <div className="mt-2 text-[12px] uppercase tracking-[0.12em] text-ink-3">{label}</div>
    </div>
  )
}

// ── Alankrit ──

function RivalView() {
  const { habits, ix, rival, now } = useData()
  const ids = habits.map((h) => h.id)
  const season = scoreIn(ix, rival, ids, monthStart(ix.today), ix.today, now)
  const allTime = scoreIn(ix, rival, ids, ix.startDay, ix.today, now)
  const seasons = pastSeasons(ix, rival, ids, now)
  const wk = weekStart(ix.today)
  const winsYou = seasons.filter((s) => s.winner === 'you').length
  const winsHim = seasons.filter((s) => s.winner === 'rival').length

  return (
    <>
      <section className="relative mt-5 overflow-hidden rounded-[32px] border border-line bg-surface p-5">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-60 rounded-full opacity-[0.15] blur-3xl" style={{ background: RIVAL.color }} />
        <Eyebrow>Season · {fmtDay(ix.today, { month: 'long' })}</Eyebrow>
        <Scoreboard score={season} big />
        <p className="mt-4 text-[14px] text-ink-2">
          {season.you > season.him
            ? `You're leading the ${fmtDay(ix.today, { month: 'long' })} season. Keep your foot down.`
            : season.you < season.him
              ? `${RIVAL.name} leads this season by ${season.him - season.you}. Take it back.`
              : 'Season is dead level.'}
        </p>
      </section>

      <SectionLabel>This week's matchups</SectionLabel>
      <div className="space-y-3">
        {habits.map((h) => {
          const s = scoreIn(ix, rival, [h.id], wk, ix.today, now)
          const total = Math.max(1, s.you + s.him)
          return (
            <div key={h.id} className="rounded-[24px] border border-line bg-surface px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2" style={{ color: h.color }}>
                  <HabitIcon habit={h} size={18} />
                  <span className="font-display text-xl font-bold uppercase tracking-wide text-ink">{h.name}</span>
                </div>
                <div className="font-display text-xl font-bold tabular-nums">
                  <span style={{ color: h.color }}>{s.you}</span>
                  <span className="mx-1.5 text-ink-3">–</span>
                  <span style={{ color: RIVAL.color }}>{s.him}</span>
                </div>
              </div>
              <div className="mt-3 flex h-2.5 gap-1 overflow-hidden rounded-full bg-surface-3">
                <motion.div className="h-full rounded-full" style={{ background: h.color }} initial={{ width: 0 }} animate={{ width: `${(s.you / total) * 100}%` }} />
                <div className="flex-1" />
                <motion.div className="h-full rounded-full" style={{ background: RIVAL.color }} initial={{ width: 0 }} animate={{ width: `${(s.him / total) * 100}%` }} />
              </div>
              <div className="mt-2 text-[12px] text-ink-3">{s.draws} draw{s.draws === 1 ? '' : 's'} · Full beats minimum, minimum beats a miss</div>
            </div>
          )
        })}
      </div>

      <SectionLabel>All-time</SectionLabel>
      <div className="rounded-[24px] border border-line bg-surface p-5">
        <Scoreboard score={allTime} />
        <div className="mt-3 text-[13px] text-ink-3">
          Since Day 1 · {allTime.draws} draws · seasons won: you {winsYou}, {RIVAL.name} {winsHim}
        </div>
      </div>

      {seasons.length > 0 && (
        <>
          <SectionLabel>Trophy cabinet</SectionLabel>
          <div className="space-y-2">
            {seasons.map((s) => (
              <div key={s.month} className="flex items-center gap-4 rounded-[20px] border border-line bg-surface px-4 py-3">
                <div
                  className="grid size-11 place-items-center rounded-2xl"
                  style={{
                    background: s.winner === 'you' ? 'rgb(255 197 61 / .14)' : 'var(--color-surface-2)',
                    color: s.winner === 'you' ? '#ffc53d' : 'var(--color-ink-3)',
                  }}
                >
                  {s.winner === 'rival' ? <RivalAvatar size={26} /> : <Trophy size={20} aria-hidden />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-lg font-bold uppercase tracking-wide">{s.label}</div>
                  <div className="text-[13px] text-ink-3">
                    {s.winner === 'you' ? 'Season won' : s.winner === 'rival' ? `${RIVAL.name} took it` : 'Drawn season'}
                  </div>
                </div>
                <div className="font-display text-lg font-bold tabular-nums">
                  {s.score.you}–{s.score.him}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function Scoreboard({ score, big }: { score: Score; big?: boolean }) {
  const size = big ? 'text-[76px]' : 'text-[48px]'
  return (
    <div className="mt-3 flex items-center justify-between">
      <div>
        <div className={`font-display ${size} font-extrabold leading-[0.85] tabular-nums`}>{score.you}</div>
        <div className="mt-2 font-display text-sm font-bold uppercase tracking-[0.2em] text-ink-2">You</div>
      </div>
      <div className="font-display text-2xl font-bold text-ink-3">vs</div>
      <div className="text-right">
        <div className={`font-display ${size} font-extrabold leading-[0.85] tabular-nums`} style={{ color: RIVAL.color }}>
          {score.him}
        </div>
        <div className="mt-2 flex items-center justify-end gap-1.5 font-display text-sm font-bold uppercase tracking-[0.2em] text-ink-2">
          <RivalAvatar size={18} /> {RIVAL.name}
        </div>
      </div>
    </div>
  )
}
