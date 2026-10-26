import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUp, Camera, Check, Clock, History, ImageIcon, Link2, RotateCcw, Undo2, X } from 'lucide-react'
import { db, type Habit, type Level } from '../db'
import { useData, usePhotoUrl } from '../data'
import { processPhoto, type ProcessedPhoto } from '../lib/image'
import { chainOf, logOf, raceOf, type Index } from '../lib/stats'
import { addDays, dayStartOf, diffDays, fmtDay, relativeDay, timeOnDay, type DayKey } from '../lib/day'
import { HoldButton } from './HoldButton'
import { HabitHistory } from './HabitHistory'
import { CommitPattern, Eyebrow, GHOST, HabitIcon, LevelBadge, Overlay, Segmented, tint } from './ui'

type Step = 'view' | 'choose' | 'preview' | 'sealed'
type Source = 'camera' | 'gallery' | 'none'
/** When the habit was actually done: kept as-is, now, N hours ago, or a time of day ("HH:MM"). null = not picked yet. */
type When = 'keep' | 'now' | number | string | null

const SOURCE_KEY = 'identity.photoSource'
/** How far back a missed day can still be logged. */
const BACKFILL_DAYS = 6
/** Rough times for a past day, when the exact minute is long forgotten. */
const PAST_TIMES = [
  { value: '09:00', label: 'Morning' },
  { value: '14:00', label: 'Afternoon' },
  { value: '19:00', label: 'Evening' },
  { value: '23:00', label: 'Night' },
]

/** Days that can still be sealed, newest first: today, then back to the limit (never before day 1). */
function loggableDays(ix: Index): DayKey[] {
  const out: DayKey[] = []
  for (let i = 0; i <= BACKFILL_DAYS; i++) {
    const d = addDays(ix.today, -i)
    if (d < ix.startDay) break
    out.push(d)
  }
  return out
}

const dayNumberOf = (ix: Index, day: DayKey) => diffDays(day, ix.startDay) + 1

/** "Today", "Yesterday", then "Wed 21". */
const shortDay = (ix: Index, day: DayKey) => (diffDays(ix.today, day) < 2 ? relativeDay(day, ix.today) : fmtDay(day, { weekday: 'short', day: 'numeric' }))

/** The last photo choice, so someone who usually logs late isn't sent to the camera every time. */
function lastSource(): Source {
  try {
    const s = localStorage.getItem(SOURCE_KEY)
    return s === 'gallery' || s === 'none' ? s : 'camera'
  } catch {
    return 'camera'
  }
}

const fmtTime = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** "I am someone who shows up to train." → ["I am someone who", "shows up to train."] */
function splitIdentity(identity: string): [string, string] {
  const m = identity.match(/^(I am someone (?:who)?|I'm someone (?:who)?)\s*(.*)$/i)
  return m ? [m[1].trim(), m[2]] : ['', identity]
}

export function RitualFlow({ habit, day: initialDay, onClose }: { habit: Habit; day?: DayKey; onClose: () => void }) {
  const { ix } = useData()
  const [day, setDay] = useState<DayKey>(initialDay ?? ix.today)
  const isToday = day === ix.today
  const existing = logOf(ix, habit.id, day)
  const [step, setStep] = useState<Step>(existing ? 'view' : 'choose')
  const [level, setLevel] = useState<Level>('min')
  const [source, setSourceState] = useState<Source>(lastSource)
  const [when, setWhen] = useState<When>(existing ? 'keep' : isToday ? 'now' : null)
  const [photo, setPhoto] = useState<ProcessedPhoto & { url: string }>()
  const [caption, setCaption] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo])

  const setSource = (s: Source) => {
    setSourceState(s)
    try {
      localStorage.setItem(SOURCE_KEY, s)
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  }

  const pickDay = (d: DayKey) => {
    const log = logOf(ix, habit.id, d)
    setDay(d)
    setWhen(log ? 'keep' : d === ix.today ? 'now' : null)
    setStep(log ? 'view' : 'choose')
  }

  const dayStart = dayStartOf(day)
  const doneAt = (now: number): number => {
    if (when === 'keep') return existing?.at ?? now
    if (when === 'now' || when === null) return now
    const t = typeof when === 'number' ? now - when * 3_600_000 : timeOnDay(day, when)
    // Stay inside the chosen day (it ends at the next day's 4 AM) and never in the future.
    return Math.min(now, dayStartOf(addDays(day, 1)) - 60_000, Math.max(dayStart, t))
  }

  const choose = (lvl: Level) => {
    setLevel(lvl)
    setError(undefined)
    if (source === 'none') {
      setPhoto(undefined)
      setStep('preview')
    } else {
      ;(source === 'camera' ? cameraInput : galleryInput).current?.click()
    }
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const p = await processPhoto(file)
      setPhoto({ ...p, url: URL.createObjectURL(p.blob) })
      setStep('preview')
    } catch {
      setError("Couldn't read that photo. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const seal = async () => {
    const now = doneAt(Date.now())
    await db.transaction('rw', db.logs, db.photos, db.misses, async () => {
      const photoId = photo ? await db.photos.add({ blob: photo.blob, thumb: photo.thumb, w: photo.w, h: photo.h, at: now }) : undefined
      // A day logged late wasn't a miss after all, so its "what got in the way?" answer goes.
      await db.misses.where({ habitId: habit.id, day }).delete()
      const prev = await db.logs.where({ habitId: habit.id, day }).first()
      if (prev) {
        if (photoId && prev.photoId) await db.photos.delete(prev.photoId)
        await db.logs.update(prev.id!, {
          level,
          photoId: photoId ?? prev.photoId,
          caption: caption.trim() || prev.caption,
          source: 'ritual',
          at: now,
        })
      } else {
        await db.logs.add({ habitId: habit.id, day, level, photoId, caption: caption.trim() || undefined, source: 'ritual', at: now })
      }
    })
    void navigator.storage?.persist?.()
    navigator.vibrate?.([15, 60, 40])
    setStep('sealed')
  }

  const [lead, rest] = splitIdentity(habit.identity)
  const cameraInputs = (
    <>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </>
  )

  return (
    <>
      <Overlay label={`${habit.name} ritual`} onClose={onClose}>
        {cameraInputs}
        <div className="flex h-12 items-center justify-between">
          <button onClick={onClose} aria-label="Close" className="-ml-2 grid size-11 place-items-center rounded-pill text-ink-2 active:bg-surface-2">
            <X size={24} />
          </button>
          <Eyebrow>
            Ritual · Day {dayNumberOf(ix, day)}
          </Eyebrow>
          <button
            onClick={() => setShowHistory(true)}
            className="-mr-2 flex h-11 items-center gap-1.5 rounded-pill px-3 text-[13px] font-medium text-ink-2 active:bg-surface-2"
          >
            <History size={18} aria-hidden /> History
          </button>
        </div>

        {(step === 'choose' || step === 'view') && <DayPicker habit={habit} day={day} onPick={pickDay} />}

        <AnimatePresence mode="wait">
          {step === 'choose' && (
            <Stage key="choose">
              <div className="mt-5 flex items-center gap-2" style={{ color: habit.color }}>
                <HabitIcon habit={habit} size={22} />
                <span className="font-display text-lg font-bold uppercase tracking-[0.2em]">{habit.name}</span>
              </div>
              <h2 className="mt-3 font-display text-[44px] font-bold uppercase leading-[0.95] tracking-tight">
                {lead && <span className="text-ink-3">{lead} </span>}
                <span style={{ color: habit.color }}>{rest}</span>
              </h2>

              <div className="mt-8">
                <Segmented<Source>
                  id="source"
                  value={source}
                  onChange={setSource}
                  options={[
                    { value: 'camera', label: 'Camera' },
                    { value: 'gallery', label: 'Gallery' },
                    { value: 'none', label: 'No photo' },
                  ]}
                />
                <p className="mt-2 text-center text-[13px] text-ink-3">
                  {source === 'none' ? 'Photos are optional. You can add one later from the sealed card.' : 'A photo makes it a ritual, but it’s optional.'}
                </p>
              </div>

              <div className="mt-4 space-y-3">
                <OptionCard
                  title="Bare minimum"
                  body={habit.minimum}
                  note="Keeps the identity alive"
                  color={habit.color}
                  source={source}
                  primary
                  onClick={() => choose('min')}
                />
                <OptionCard title="Full" body={habit.full} note="Bonus day — the ghost falls further behind" color={habit.color} source={source} onClick={() => choose('full')} />
              </div>
              {busy && <p className="mt-4 text-center text-sm text-ink-2">Developing photo…</p>}
              {error && <p className="mt-4 text-center text-sm text-danger">{error}</p>}
            </Stage>
          )}

          {step === 'preview' && (
            <Stage key="preview">
              <div className="relative mt-4 aspect-[3/4] w-full overflow-hidden rounded-card bg-surface">
                {photo ? <img src={photo.url} alt="Your ritual photo" className="absolute inset-0 size-full object-cover" /> : <CommitPattern color={habit.color} />}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <div className="flex items-center gap-2">
                    <LevelBadge level={level} color={habit.color} />
                    <Eyebrow className="text-ink-2">
                      {isToday ? `Day ${dayNumberOf(ix, day)}` : shortDay(ix, day)} · {habit.name}
                    </Eyebrow>
                  </div>
                  <p className="mt-3 font-display text-[28px] font-bold uppercase leading-none">{habit.identity}</p>
                </div>
                <div aria-hidden className="pointer-events-none absolute inset-0 rounded-card" style={{ boxShadow: `inset 0 0 0 1.5px ${tint(habit.color, 50)}` }} />
              </div>

              <WhenPicker when={when} setWhen={setWhen} dayStart={dayStart} keepAt={existing?.at} past={!isToday} />

              <label className="mt-4 block">
                <span className="sr-only">Caption</span>
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={80}
                  placeholder={isToday ? 'One line about today (optional)' : 'One line about that day (optional)'}
                  className="h-14 w-full rounded-2xl border border-line bg-surface px-4 text-[16px] text-ink placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
                />
              </label>

              <div className="mt-5">
                <HoldButton
                  color={habit.color}
                  label={when === null ? 'Pick a time first' : isToday ? 'Hold to seal' : `Seal ${shortDay(ix, day)}`}
                  onDone={seal}
                  disabled={when === null}
                />
              </div>
              <button onClick={() => setStep('choose')} className="mx-auto mt-3 flex h-11 items-center gap-2 px-4 text-sm text-ink-2">
                <RotateCcw size={16} aria-hidden /> Retake
              </button>
            </Stage>
          )}

          {step === 'sealed' && <Sealed key="sealed" habit={habit} day={day} level={level} onClose={onClose} />}

          {step === 'view' && existing && (
            <ViewSeal key={`view-${day}`} habit={habit} day={day} onRedo={() => setStep('choose')} onClose={onClose} />
          )}
        </AnimatePresence>
      </Overlay>
      <AnimatePresence>
        {showHistory && (
          <HabitHistory
            habit={habit}
            canLog={(d) => loggableDays(ix).includes(d)}
            onLogDay={(d) => {
              setShowHistory(false)
              pickDay(d)
            }}
            onClose={() => setShowHistory(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
      {children}
    </motion.div>
  )
}

/** Which day this seal is for. A day you did the work but never opened the app can still be logged. */
function DayPicker({ habit, day, onPick }: { habit: Habit; day: DayKey; onPick: (d: DayKey) => void }) {
  const { ix } = useData()
  const days = loggableDays(ix)
  if (days.length < 2) return null
  return (
    <div className="mt-3">
      <div className="text-[13px] text-ink-3">Which day?</div>
      <div className="-mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1" role="radiogroup" aria-label="Which day?">
        {days.map((d) => {
          const on = d === day
          const sealed = !!logOf(ix, habit.id, d)
          return (
            <button
              key={d}
              role="radio"
              aria-checked={on}
              onClick={() => onPick(d)}
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-pill border px-4 text-[14px] transition-colors ${on ? 'border-ink bg-ink font-semibold text-black' : 'border-line bg-surface text-ink'}`}
            >
              {sealed && <Check size={14} strokeWidth={3} aria-label="sealed" style={on ? undefined : { color: habit.color }} />}
              {shortDay(ix, d)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** "When did you do it?" Logging late shouldn't make a 7 AM workout look like an 11 PM one. */
function WhenPicker({ when, setWhen, dayStart, keepAt, past }: { when: When; setWhen: (w: When) => void; dayStart: number; keepAt?: number; past: boolean }) {
  const now = Date.now()
  const chips: { value: When; label: string }[] = [
    ...(keepAt ? [{ value: 'keep' as const, label: `Keep ${fmtTime(keepAt)}` }] : []),
    ...(past
      ? PAST_TIMES
      : [
          { value: 'now' as const, label: 'Just now' },
          ...[1, 2, 3, 5].filter((h) => now - h * 3_600_000 >= dayStart).map((h) => ({ value: h, label: `${h} h ago` })),
        ]),
  ]
  const custom = typeof when === 'string' && !chips.some((c) => c.value === when)
  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 text-[14px] font-medium">
        <Clock size={16} className="text-ink-3" aria-hidden /> When did you do it?
        {past && when === null && <span className="font-normal text-ink-3">· roughly is fine</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="When did you do it?">
        {chips.map((c) => {
          const on = when === c.value
          return (
            <button
              key={String(c.value)}
              role="radio"
              aria-checked={on}
              onClick={() => setWhen(c.value)}
              className={`h-10 rounded-pill border px-4 text-[14px] transition-colors ${on ? 'border-ink bg-ink font-semibold text-black' : 'border-line bg-surface text-ink'}`}
            >
              {c.label}
            </button>
          )
        })}
        <label className={`flex h-10 items-center gap-2 rounded-pill border px-3 text-[14px] ${custom ? 'border-ink' : 'border-line'} bg-surface`}>
          <span className="text-ink-3">At</span>
          <input
            type="time"
            value={custom ? (when as string) : ''}
            onChange={(e) => e.target.value && setWhen(e.target.value)}
            className="bg-transparent text-ink [color-scheme:dark] focus:outline-none"
            aria-label="Exact time"
          />
        </label>
      </div>
    </div>
  )
}

function OptionCard({
  title,
  body,
  note,
  color,
  source,
  primary,
  onClick,
}: {
  title: string
  body: string
  note: string
  color: string
  source: Source
  primary?: boolean
  onClick: () => void
}) {
  const Icon = source === 'camera' ? Camera : source === 'gallery' ? ImageIcon : Check
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-card border p-5 text-left"
      style={primary ? { borderColor: tint(color, 60), background: tint(color, 10) } : { borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}
    >
      <div className="min-w-0 flex-1">
        <div className="font-display text-sm font-bold uppercase tracking-[0.22em]" style={{ color: primary ? color : 'var(--color-ink-2)' }}>
          {title}
        </div>
        <div className="mt-1.5 text-[17px] leading-snug text-ink">{body}</div>
        <div className="mt-2 text-[13px] text-ink-3">{note}</div>
      </div>
      <span
        className="grid size-12 shrink-0 place-items-center rounded-pill"
        style={primary ? { background: color, color: '#000' } : { background: 'var(--color-surface-3)', color: 'var(--color-ink)' }}
      >
        <Icon size={22} strokeWidth={2.25} aria-hidden />
      </span>
    </motion.button>
  )
}

function Sealed({ habit, day, level, onClose }: { habit: Habit; day: DayKey; level: Level; onClose: () => void }) {
  const { ix } = useData()
  const chain = chainOf(ix, habit.id)
  const race = raceOf(ix, [habit.id], 7)
  return (
    <motion.button
      onClick={onClose}
      className="flex min-h-[70dvh] w-full flex-col items-center justify-center text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* The stamp comes down hard, like the last rep. */}
      <motion.div
        initial={{ scale: 2.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 22, delay: 0.05 }}
      >
        <div className="stamp text-[64px]" style={{ color: habit.color }}>
          Sealed
          <span className="mt-2 font-sans text-[13px] font-bold tracking-[0.2em]">
            {habit.name} · {fmtDay(day, { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <p className="mt-10 text-ink-2">
          +1 vote for <span style={{ color: habit.color }}>{habit.identity}</span>
        </p>
        <div className="mt-8 flex items-center justify-center gap-6">
          <Stat icon={<Link2 size={18} aria-hidden />} value={chain.links} label="Chain" />
          <div className="h-10 border-l border-dashed border-line" />
          <Stat
            icon={<ArrowUp size={18} aria-hidden style={{ color: GHOST }} />}
            value={race.lead >= 0 ? `+${race.lead}` : race.lead}
            label="vs last-week you"
          />
          <div className="h-10 border-l border-dashed border-line" />
          <Stat icon={<HabitIcon habit={habit} size={18} />} value={level === 'full' ? 'Full' : 'Min'} label="Level" />
        </div>
        <p className="mt-12 text-sm text-ink-3">Tap anywhere to close</p>
      </motion.div>
    </motion.button>
  )
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-1.5 font-display text-3xl font-bold tabular-nums">
        {icon}
        {value}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-ink-3">{label}</div>
    </div>
  )
}

function ViewSeal({ habit, day, onRedo, onClose }: { habit: Habit; day: DayKey; onRedo: () => void; onClose: () => void }) {
  const { ix } = useData()
  const log = logOf(ix, habit.id, day)
  const url = usePhotoUrl(log?.photoId, 'blob')
  const [confirmUndo, setConfirmUndo] = useState(false)
  if (!log) return null

  const upgrade = () => db.logs.update(log.id!, { level: 'full' })
  const undo = async () => {
    if (!confirmUndo) return setConfirmUndo(true)
    await db.transaction('rw', db.logs, db.photos, async () => {
      if (log.photoId) await db.photos.delete(log.photoId)
      await db.logs.delete(log.id!)
    })
    onClose()
  }

  return (
    <Stage>
      <div className="relative mt-4 aspect-[3/4] w-full overflow-hidden rounded-card bg-surface">
        {url ? <img src={url} alt={`${habit.name} ritual photo`} className="absolute inset-0 size-full object-cover" /> : <CommitPattern color={habit.color} />}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <div className="flex items-center gap-2">
            <LevelBadge level={log.level} color={habit.color} />
            <Eyebrow className="text-ink-2">
              {day === ix.today ? 'Sealed' : `${shortDay(ix, day)} ·`} {fmtTime(log.at)}
            </Eyebrow>
          </div>
          <p className="mt-3 font-display text-[28px] font-bold uppercase leading-none">{habit.identity}</p>
          {log.caption && <p className="mt-2 text-ink-2">“{log.caption}”</p>}
          {log.source === 'github' && !log.photoId && <p className="mt-2 text-ink-2">Verified automatically by your GitHub pushes.</p>}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {log.level === 'min' && (
          <button
            onClick={upgrade}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-pill font-display text-base font-bold uppercase tracking-[0.16em] text-black"
            style={{ background: habit.color }}
          >
            <ArrowUp size={20} strokeWidth={2.75} aria-hidden /> Upgrade to full
          </button>
        )}
        <button
          onClick={onRedo}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-pill border border-line bg-surface font-display text-base font-bold uppercase tracking-[0.16em]"
        >
          <Camera size={20} aria-hidden /> {log.photoId ? 'Redo the ritual' : 'Add a ritual photo'}
        </button>
        <button
          onClick={undo}
          className={`flex h-12 w-full items-center justify-center gap-2 rounded-pill text-sm ${confirmUndo ? 'bg-danger/15 font-semibold text-danger' : 'text-ink-3'}`}
        >
          <Undo2 size={16} aria-hidden /> {confirmUndo ? 'Tap again to remove this seal' : 'Undo seal'}
        </button>
      </div>
    </Stage>
  )
}
