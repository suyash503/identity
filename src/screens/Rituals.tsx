import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Camera, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { Log } from '../db'
import { useData, usePhotoUrl } from '../data'
import { Eyebrow, HabitIcon, LevelBadge, tint } from '../components/ui'
import { fmtDay, relativeDay } from '../lib/day'

export function Rituals() {
  const { habits, logs, today } = useData()
  const [filter, setFilter] = useState<string>('all')
  const [openIdx, setOpenIdx] = useState<number>()

  const photos = useMemo(
    () =>
      logs
        .filter((l) => l.photoId && (filter === 'all' || l.habitId === filter))
        .sort((a, b) => (a.day === b.day ? b.at - a.at : b.day.localeCompare(a.day))),
    [logs, filter],
  )
  const byDay = useMemo(() => {
    const groups = new Map<string, Log[]>()
    for (const l of photos) groups.set(l.day, [...(groups.get(l.day) ?? []), l])
    return [...groups.entries()]
  }, [photos])

  return (
    <div className="px-5 pt-[calc(env(safe-area-inset-top)+28px)]">
      <h1 className="font-display text-[64px] font-extrabold uppercase leading-[0.85] tracking-tight">Rituals</h1>
      <p className="mt-3 text-ink-2">
        Every vote you’ve cast. <span className="text-ink tabular-nums">{logs.filter((l) => l.photoId).length}</span> so far.
      </p>

      <div className="no-scrollbar -mx-5 mt-6 flex gap-2 overflow-x-auto px-5" role="tablist">
        {[{ id: 'all', name: 'All', color: '#f5f5f7' }, ...habits].map((h) => {
          const active = filter === h.id
          return (
            <button
              key={h.id}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(h.id)}
              className="flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 font-display text-[15px] font-semibold uppercase tracking-[0.12em]"
              style={active ? { background: h.color, borderColor: h.color, color: '#000' } : { borderColor: 'var(--color-line)', color: 'var(--color-ink-2)' }}
            >
              {h.id !== 'all' && <span className="size-2 rounded-full" style={{ background: active ? '#000' : h.color }} />}
              {h.name}
            </button>
          )
        })}
      </div>

      {byDay.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <div className="grid size-16 place-items-center rounded-full bg-surface-2 text-ink-3">
            <Camera size={28} aria-hidden />
          </div>
          <p className="mt-4 font-display text-2xl font-bold uppercase">No rituals yet</p>
          <p className="mt-1 max-w-[16rem] text-ink-3">Seal a habit with a photo and it lands here, forever.</p>
        </div>
      ) : (
        byDay.map(([day, items]) => (
          <section key={day} className="mt-8">
            <div className="mb-3 flex items-baseline justify-between">
              <Eyebrow className="text-ink-2">{relativeDay(day, today)}</Eyebrow>
              <span className="text-[12px] text-ink-3">{fmtDay(day, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {items.map((l) => (
                <Tile key={l.id} log={l} onOpen={() => setOpenIdx(photos.indexOf(l))} />
              ))}
            </div>
          </section>
        ))
      )}
      <div className="h-8" />

      <AnimatePresence>
        {openIdx !== undefined && photos[openIdx] && (
          <Viewer
            log={photos[openIdx]}
            onClose={() => setOpenIdx(undefined)}
            onPrev={openIdx > 0 ? () => setOpenIdx(openIdx - 1) : undefined}
            onNext={openIdx < photos.length - 1 ? () => setOpenIdx(openIdx + 1) : undefined}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function Tile({ log, onOpen }: { log: Log; onOpen: () => void }) {
  const { habits } = useData()
  const habit = habits.find((h) => h.id === log.habitId)!
  const url = usePhotoUrl(log.photoId)
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onOpen}
      className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-surface-2"
      aria-label={`${habit.name} ritual, ${log.level === 'full' ? 'full' : 'minimum'}`}
    >
      {url && <img src={url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <div className="absolute bottom-2 left-2 flex items-center gap-1" style={{ color: habit.color }}>
        <HabitIcon habit={habit} size={14} />
        {log.level === 'full' && <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em]">Full</span>}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl" style={{ boxShadow: `inset 0 0 0 1px ${tint(habit.color, 35)}` }} />
    </motion.button>
  )
}

function Viewer({ log, onClose, onPrev, onNext }: { log: Log; onClose: () => void; onPrev?: () => void; onNext?: () => void }) {
  const { habits, today } = useData()
  const habit = habits.find((h) => h.id === log.habitId)!
  const url = usePhotoUrl(log.photoId, 'blob')
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`${habit.name} ritual photo`}
      className="fixed inset-0 z-50 flex flex-col bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
        if (e.key === 'ArrowLeft') onPrev?.()
        if (e.key === 'ArrowRight') onNext?.()
      }}
    >
      <div className="relative flex-1">
        {url && <img src={url} alt="" className="absolute inset-0 size-full object-contain" />}
        <button
          onClick={onClose}
          aria-label="Close"
          autoFocus
          className="absolute right-4 top-[calc(env(safe-area-inset-top)+12px)] grid size-11 place-items-center rounded-full bg-black/60 text-ink backdrop-blur"
        >
          <X size={22} />
        </button>
        {onPrev && (
          <button onClick={onPrev} aria-label="Newer photo" className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 backdrop-blur">
            <ChevronLeft size={24} />
          </button>
        )}
        {onNext && (
          <button onClick={onNext} aria-label="Older photo" className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 backdrop-blur">
            <ChevronRight size={24} />
          </button>
        )}
      </div>
      <div className="mx-auto w-full max-w-md px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4">
        <div className="flex items-center gap-2">
          <LevelBadge level={log.level} color={habit.color} />
          <Eyebrow className="text-ink-2">
            {relativeDay(log.day, today)} · {habit.name}
          </Eyebrow>
        </div>
        <p className="mt-3 font-display text-[26px] font-bold uppercase leading-none">{habit.identity}</p>
        {log.caption && <p className="mt-2 text-ink-2">“{log.caption}”</p>}
      </div>
    </motion.div>
  )
}
