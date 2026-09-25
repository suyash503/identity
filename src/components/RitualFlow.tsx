import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUp, Camera, Check, ImageIcon, Link2, RotateCcw, Undo2, X } from 'lucide-react'
import { db, type Habit, type Level } from '../db'
import { useData, usePhotoUrl } from '../data'
import { processPhoto, type ProcessedPhoto } from '../lib/image'
import { chainOf, dayNumber, logOf, raceOf } from '../lib/stats'
import { HoldButton } from './HoldButton'
import { CommitPattern, Eyebrow, GHOST, HabitIcon, LevelBadge, Overlay, Segmented, tint } from './ui'

type Step = 'view' | 'choose' | 'preview' | 'sealed'
type Source = 'camera' | 'gallery' | 'none'

/** "I am someone who shows up to train." → ["I am someone who", "shows up to train."] */
function splitIdentity(identity: string): [string, string] {
  const m = identity.match(/^(I am someone (?:who)?|I'm someone (?:who)?)\s*(.*)$/i)
  return m ? [m[1].trim(), m[2]] : ['', identity]
}

export function RitualFlow({ habit, onClose }: { habit: Habit; onClose: () => void }) {
  const { ix } = useData()
  const existing = logOf(ix, habit.id, ix.today)
  const [step, setStep] = useState<Step>(existing ? 'view' : 'choose')
  const [level, setLevel] = useState<Level>('min')
  const [source, setSource] = useState<Source>('camera')
  const [photo, setPhoto] = useState<ProcessedPhoto & { url: string }>()
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo])

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
    const now = Date.now()
    await db.transaction('rw', db.logs, db.photos, async () => {
      const photoId = photo ? await db.photos.add({ blob: photo.blob, thumb: photo.thumb, w: photo.w, h: photo.h, at: now }) : undefined
      const prev = await db.logs.where({ habitId: habit.id, day: ix.today }).first()
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
        await db.logs.add({ habitId: habit.id, day: ix.today, level, photoId, caption: caption.trim() || undefined, source: 'ritual', at: now })
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
    <Overlay label={`${habit.name} ritual`} onClose={onClose}>
      {cameraInputs}
      <div className="flex h-12 items-center justify-between">
        <button onClick={onClose} aria-label="Close" className="-ml-2 grid size-11 place-items-center rounded-full text-ink-2 active:bg-surface-2">
          <X size={24} />
        </button>
        <Eyebrow>
          Ritual · Day {dayNumber(ix)}
        </Eyebrow>
        <div className="size-11" />
      </div>

      <AnimatePresence mode="wait">
        {step === 'choose' && (
          <Stage key="choose">
            <div className="mt-6 flex items-center gap-2" style={{ color: habit.color }}>
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
                  ...(habit.verify === 'github' ? [{ value: 'none' as const, label: 'No photo' }] : []),
                ]}
              />
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
            <div className="relative mt-4 aspect-[3/4] w-full overflow-hidden rounded-[32px] bg-surface">
              {photo ? <img src={photo.url} alt="Your ritual photo" className="absolute inset-0 size-full object-cover" /> : <CommitPattern color={habit.color} />}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <div className="flex items-center gap-2">
                  <LevelBadge level={level} color={habit.color} />
                  <Eyebrow className="text-ink-2">Day {dayNumber(ix)} · {habit.name}</Eyebrow>
                </div>
                <p className="mt-3 font-display text-[28px] font-bold uppercase leading-none">{habit.identity}</p>
              </div>
              <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[32px]" style={{ boxShadow: `inset 0 0 0 1.5px ${tint(habit.color, 50)}` }} />
            </div>

            <label className="mt-5 block">
              <span className="sr-only">Caption</span>
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={80}
                placeholder="One line about today (optional)"
                className="h-14 w-full rounded-2xl border border-line bg-surface px-4 text-[16px] text-ink placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
              />
            </label>

            <div className="mt-5">
              <HoldButton color={habit.color} label="Hold to seal" onDone={seal} />
            </div>
            <button onClick={() => setStep('choose')} className="mx-auto mt-3 flex h-11 items-center gap-2 px-4 text-sm text-ink-2">
              <RotateCcw size={16} aria-hidden /> Retake
            </button>
          </Stage>
        )}

        {step === 'sealed' && <Sealed key="sealed" habit={habit} level={level} onClose={onClose} />}

        {step === 'view' && existing && (
          <ViewSeal key="view" habit={habit} onRedo={() => setStep('choose')} onClose={onClose} />
        )}
      </AnimatePresence>
    </Overlay>
  )
}

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
      {children}
    </motion.div>
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
      className="flex w-full items-center gap-4 rounded-[26px] border p-5 text-left"
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
        className="grid size-12 shrink-0 place-items-center rounded-full"
        style={primary ? { background: color, color: '#000' } : { background: 'var(--color-surface-3)', color: 'var(--color-ink)' }}
      >
        <Icon size={22} strokeWidth={2.25} aria-hidden />
      </span>
    </motion.button>
  )
}

function Sealed({ habit, level, onClose }: { habit: Habit; level: Level; onClose: () => void }) {
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
      <div className="relative grid place-items-center">
        <motion.div
          aria-hidden
          className="absolute size-64 rounded-full blur-3xl"
          style={{ background: habit.color }}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 0.28, scale: 1 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
        <motion.div
          className="relative grid size-36 place-items-center rounded-full text-black"
          style={{ background: habit.color, boxShadow: `0 0 0 10px ${tint(habit.color, 18)}, 0 0 0 22px ${tint(habit.color, 8)}` }}
          initial={{ scale: 2.2, opacity: 0, rotate: -20 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.05 }}
        >
          <Check size={72} strokeWidth={3.5} aria-hidden />
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <h2 className="mt-12 font-display text-[64px] font-extrabold uppercase leading-none tracking-tight">Sealed</h2>
        <p className="mt-3 text-ink-2">
          +1 vote for <span style={{ color: habit.color }}>{habit.identity}</span>
        </p>
        <div className="mt-8 flex items-center justify-center gap-6">
          <Stat icon={<Link2 size={18} aria-hidden />} value={chain.links} label="Chain" />
          <div className="h-10 w-px bg-line" />
          <Stat
            icon={<ArrowUp size={18} aria-hidden style={{ color: GHOST }} />}
            value={race.lead >= 0 ? `+${race.lead}` : race.lead}
            label="vs last-week you"
          />
          <div className="h-10 w-px bg-line" />
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

function ViewSeal({ habit, onRedo, onClose }: { habit: Habit; onRedo: () => void; onClose: () => void }) {
  const { ix } = useData()
  const log = logOf(ix, habit.id, ix.today)
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
      <div className="relative mt-4 aspect-[3/4] w-full overflow-hidden rounded-[32px] bg-surface">
        {url ? <img src={url} alt={`${habit.name} ritual photo`} className="absolute inset-0 size-full object-cover" /> : <CommitPattern color={habit.color} />}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <div className="flex items-center gap-2">
            <LevelBadge level={log.level} color={habit.color} />
            <Eyebrow className="text-ink-2">
              Sealed {new Date(log.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
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
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full font-display text-base font-bold uppercase tracking-[0.16em] text-black"
            style={{ background: habit.color }}
          >
            <ArrowUp size={20} strokeWidth={2.75} aria-hidden /> Upgrade to full
          </button>
        )}
        <button
          onClick={onRedo}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-full border border-line bg-surface font-display text-base font-bold uppercase tracking-[0.16em]"
        >
          <Camera size={20} aria-hidden /> {log.photoId ? 'Redo the ritual' : 'Add a ritual photo'}
        </button>
        <button
          onClick={undo}
          className={`flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm ${confirmUndo ? 'bg-danger/15 font-semibold text-danger' : 'text-ink-3'}`}
        >
          <Undo2 size={16} aria-hidden /> {confirmUndo ? 'Tap again to remove this seal' : 'Undo seal'}
        </button>
      </div>
    </Stage>
  )
}
