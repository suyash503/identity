import { useRef, useState, type ChangeEvent } from 'react'
import { ChevronRight, CloudUpload, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { setSetting } from '../db'
import { useData } from '../data'
import { backupAgo, backupOverdue, createBackup, readBackup, restoreBackup, saveBackupFile, type ParsedBackup } from '../lib/backup'
import { dayNumber } from '../lib/stats'
import type { CloudSyncState } from '../lib/cloud'
import { SectionLabel } from './ui'

const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`

function useOverdue() {
  const { settings, logs, ix } = useData()
  const last = settings.lastBackup as number | undefined
  return { last, overdue: backupOverdue(last, logs.length, dayNumber(ix) - 1) }
}

export function BackupSection() {
  const { last, overdue } = useOverdue()
  const [busy, setBusy] = useState<string>()
  const [msg, setMsg] = useState<{ text: string; error?: boolean }>()
  const [pending, setPending] = useState<ParsedBackup>()
  const fileInput = useRef<HTMLInputElement>(null)

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setMsg(undefined)
    try {
      await fn()
    } catch (e) {
      setMsg({ text: (e as Error).message, error: true })
    } finally {
      setBusy(undefined)
    }
  }

  const backup = () =>
    run('Packing your rituals…', async () => {
      const { file, summary } = await createBackup()
      const result = await saveBackupFile(file)
      if (result === 'cancelled') return
      await setSetting('lastBackup', Date.now())
      setMsg({ text: `Saved ${summary.seals} seals and ${summary.photos} photos (${mb(file.size)}).` })
    })

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void run('Reading backup…', async () => setPending(await readBackup(file)))
  }

  const restore = () =>
    run('Restoring…', async () => {
      await restoreBackup(pending!)
      setPending(undefined)
      setMsg({ text: 'Restored. Welcome back.' })
    })

  const safe = !!last && !overdue
  const StatusIcon = safe ? ShieldCheck : ShieldAlert
  return (
    <>
      <SectionLabel color={overdue ? 'var(--color-danger)' : undefined}>Backup file</SectionLabel>
      <div className="rounded-[24px] border border-line bg-surface p-5">
        <div className="flex items-center gap-3">
          <div
            className="grid size-12 shrink-0 place-items-center rounded-2xl"
            style={safe ? { background: 'rgb(57 211 83 / .12)', color: '#39d353' } : { background: 'rgb(255 59 92 / .14)', color: 'var(--color-danger)' }}
          >
            <StatusIcon size={24} aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="font-display text-xl font-bold uppercase leading-tight">{last ? `Backed up ${backupAgo(last)}` : 'Never backed up'}</div>
            <div className="text-[13px] text-ink-3">Your photos and history live only on this phone.</div>
          </div>
        </div>

        <button
          onClick={backup}
          disabled={!!busy}
          className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink font-display text-base font-bold uppercase tracking-[0.14em] text-black disabled:opacity-40"
        >
          <CloudUpload size={20} aria-hidden /> Back up now
        </button>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
          Makes one .zip with everything. On Android, pick <span className="text-ink-2">Drive</span> in the share sheet to keep it safe off your phone.
        </p>

        <input ref={fileInput} type="file" accept=".zip,application/zip" className="hidden" onChange={pick} />
        {!pending && (
          <button
            onClick={() => fileInput.current?.click()}
            disabled={!!busy}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-line text-sm font-semibold text-ink-2 disabled:opacity-40"
          >
            <RotateCcw size={16} aria-hidden /> Restore from a backup file
          </button>
        )}

        {pending && (
          <div className="mt-4 rounded-2xl border border-danger/40 bg-danger/10 p-4">
            <div className="font-display text-lg font-bold uppercase">Replace everything?</div>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
              Backup from {new Date(pending.summary.exportedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}:{' '}
              {pending.summary.seals} seals over {pending.summary.days} days, {pending.summary.photos} photos. Everything currently on this phone will be
              replaced.
            </p>
            <div className="mt-4 flex gap-3">
              <button onClick={() => setPending(undefined)} disabled={!!busy} className="h-12 flex-1 rounded-full border border-line text-sm font-semibold">
                Cancel
              </button>
              <button onClick={restore} disabled={!!busy} className="h-12 flex-1 rounded-full bg-danger text-sm font-bold text-black disabled:opacity-40">
                Restore
              </button>
            </div>
          </div>
        )}

        {(busy || msg) && (
          <p role="status" className={`mt-4 text-center text-[14px] ${msg?.error ? 'text-danger' : 'text-ink-2'}`}>
            {busy ?? msg?.text}
          </p>
        )}
      </div>
    </>
  )
}

/** Shown on Today when a backup is overdue. */
export function BackupNudge({ onOpen }: { onOpen: () => void }) {
  const { settings } = useData()
  const { last, overdue } = useOverdue()
  if (!overdue) return null
  const cloud = settings.cloudSync as CloudSyncState | undefined
  const historyInCloud = !!settings.cloudToken && !!cloud && !cloud.error
  return (
    <button onClick={onOpen} className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-danger/35 bg-danger/10 px-4 py-3 text-left">
      <ShieldAlert size={20} className="shrink-0 text-danger" aria-hidden />
      <span className="flex-1 text-[14px] text-ink">
        {historyInCloud
          ? 'History is in the cloud, but your photos aren’t.'
          : last
            ? `Last backup ${backupAgo(last)}.`
            : 'Your rituals aren’t backed up yet.'}{' '}
        <span className="text-ink-2">Back up now</span>
      </span>
      <ChevronRight size={18} className="text-ink-3" aria-hidden />
    </button>
  )
}
