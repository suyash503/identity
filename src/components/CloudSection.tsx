import { useEffect, useState } from 'react'
import { ChevronRight, Cloud, CloudOff, CloudUpload, DownloadCloud, KeyRound, Link2Off, RefreshCw } from 'lucide-react'
import { useData } from '../data'
import type { BackupSummary, Manifest } from '../lib/backup'
import {
  disconnectCloud,
  fetchCloudBackup,
  listCloudBackups,
  pollPairing,
  recoverWithPhrase,
  restoreFromCloud,
  setRecoveryPhrase,
  startPairing,
  syncCloud,
  type CloudBackupEntry,
  type CloudSyncState,
} from '../lib/cloud'
import { fmtDay } from '../lib/day'
import { SectionLabel } from './ui'

type Pairing = { id: string; code: string; expiresAt: number }

const MIN_PHRASE = 10
const mb = (bytes: number) => (bytes >= 1_048_576 * 100 ? `${Math.round(bytes / 1_048_576)} MB` : `${(bytes / 1_048_576).toFixed(1)} MB`)
const time = (t: number) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const describe = (s: BackupSummary) =>
  `${s.seals} seals over ${s.days} days · ${s.photos} photos${s.startDay ? ` · Day 1 ${fmtDay(s.startDay, { day: 'numeric', month: 'short' })}` : ''}`

const inputClass =
  'h-12 w-full rounded-xl border border-line bg-surface-2 px-3.5 text-[16px] text-ink placeholder:text-ink-3 focus:border-ink-3 focus:outline-none'

export function CloudSection() {
  const { settings } = useData()
  const connected = !!settings.cloudToken
  return (
    <>
      <SectionLabel>Cloud backup</SectionLabel>
      <div className="rounded-[24px] border border-line bg-surface p-5">{connected ? <Connected /> : <Connect />}</div>
    </>
  )
}

/** On Today: says plainly when this phone isn't backed up, or when the cloud holds history this phone doesn't. */
export function CloudNudge({ onOpen }: { onOpen: () => void }) {
  const { settings } = useData()
  const sync = settings.cloudSync as CloudSyncState | undefined
  const text = !settings.cloudToken
    ? 'This phone isn’t connected to your cloud backup.'
    : sync?.needsRestore
      ? `Your history (${sync.cloudSeals ?? 'more'} seals) is in the cloud, not on this phone.`
      : undefined
  if (!text) return null
  return (
    <button onClick={onOpen} className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-left">
      <CloudOff size={20} className="shrink-0 text-ink-2" aria-hidden />
      <span className="flex-1 text-[14px] text-ink">
        {text} <span className="text-ink-2">{settings.cloudToken ? 'Restore it' : 'Reconnect'}</span>
      </span>
      <ChevronRight size={18} className="text-ink-3" aria-hidden />
    </button>
  )
}

function Connect() {
  const [pairing, setPairing] = useState<Pairing>()
  const [status, setStatus] = useState<string>()
  const [error, setError] = useState<string>()
  const [now, setNow] = useState(Date.now)
  const [phrase, setPhrase] = useState('')

  // Poll until approved or expired.
  useEffect(() => {
    if (!pairing) return
    const id = setInterval(async () => {
      setNow(Date.now())
      try {
        const s = await pollPairing(pairing.id)
        if (s === 'expired') {
          setPairing(undefined)
          setError('That code expired. Get a new one.')
        }
      } catch (e) {
        setStatus((e as Error).message)
      }
    }, 3000)
    return () => clearInterval(id)
  }, [pairing])

  const run = async (label: string, fn: () => Promise<void>) => {
    setError(undefined)
    setStatus(label)
    try {
      await fn()
      setStatus(undefined)
    } catch (e) {
      setStatus(undefined)
      setError((e as Error).message)
    }
  }

  if (pairing) {
    const left = Math.max(0, Math.round((pairing.expiresAt - now) / 60_000))
    return (
      <div className="text-center">
        <div className="text-[13px] uppercase tracking-[0.18em] text-ink-3">Pairing code</div>
        <div className="mt-2 font-display text-[64px] font-extrabold leading-none tracking-[0.18em] tabular-nums">{pairing.code}</div>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-2">
          Approve it on your computer, in the project’s <span className="text-ink">worker</span> folder:
        </p>
        <code className="mt-2 block rounded-xl bg-surface-2 px-3 py-2.5 font-mono text-[14px] text-ink">npm run approve -- {pairing.code}</code>
        <p className="mt-3 flex items-center justify-center gap-2 text-[13px] text-ink-3">
          <RefreshCw size={14} className="animate-spin" aria-hidden /> Waiting for approval · expires in {left} min
        </p>
        {status && <p className="mt-2 text-[13px] text-danger">{status}</p>}
        <button onClick={() => setPairing(undefined)} className="mt-4 h-11 px-4 text-sm text-ink-3">
          Cancel
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-ink-3">
          <CloudOff size={24} aria-hidden />
        </div>
        <div>
          <div className="font-display text-xl font-bold uppercase leading-tight">Not connected</div>
          <div className="text-[13px] text-ink-3">Automatic backup to your own Cloudflare server.</div>
        </div>
      </div>

      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault()
          void run('Reconnecting…', () => recoverWithPhrase(phrase))
        }}
      >
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-[14px] font-medium">
            <KeyRound size={15} className="text-ink-3" aria-hidden /> Reconnect with your recovery phrase
          </span>
          <input
            type="password"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="current-password"
            placeholder="Your recovery phrase"
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          disabled={!!status || phrase.trim().length < MIN_PHRASE}
          className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink font-display text-base font-bold uppercase tracking-[0.14em] text-black disabled:opacity-40"
        >
          <Cloud size={20} aria-hidden /> Reconnect
        </button>
      </form>

      <button onClick={() => run('Getting a code…', async () => setPairing(await startPairing()))} disabled={!!status} className="mt-3 h-11 w-full text-sm text-ink-2 disabled:opacity-40">
        No recovery phrase yet? Connect with a pairing code
      </button>
      {(status || error) && <p className={`mt-2 text-center text-[14px] ${error ? 'text-danger' : 'text-ink-2'}`}>{error ?? status}</p>}
    </>
  )
}

function Connected() {
  const { settings, logs } = useData()
  const sync = settings.cloudSync as CloudSyncState | undefined
  const [busy, setBusy] = useState<string>()
  const [msg, setMsg] = useState<{ text: string; error?: boolean }>()
  const [backups, setBackups] = useState<CloudBackupEntry[]>()
  const [pending, setPending] = useState<{ manifest: Manifest; summary: BackupSummary }>()
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [editingPhrase, setEditingPhrase] = useState(false)
  const [phrase, setPhrase] = useState('')

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

  const mostSeals = backups ? Math.max(...backups.map((b) => b.summary.seals)) : 0
  const statusLine = !sync
    ? 'First sync starting…'
    : sync.needsRestore
      ? `The cloud has ${sync.cloudSeals ?? 'more'} seals and this phone has ${logs.length}. Restore below to bring your history back. Nothing was overwritten.`
      : sync.photoStorage
        ? `History and ${sync.photosSafe ?? 0} photo${sync.photosSafe === 1 ? '' : 's'} safe · ${mb(sync.photoBytes ?? 0)} of ${mb(sync.photoCapacity ?? 0)} photo space used`
        : `History is safe. ${sync.photosPending ?? 0} photos are waiting for cloud photo storage.`

  return (
    <>
      <div className="flex items-center gap-3">
        <div
          className="grid size-12 shrink-0 place-items-center rounded-2xl"
          style={sync?.error ? { background: 'rgb(255 59 92 / .14)', color: 'var(--color-danger)' } : { background: 'rgb(57 211 83 / .12)', color: '#39d353' }}
        >
          <Cloud size={24} aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="font-display text-xl font-bold uppercase leading-tight">{sync?.error ? 'Sync problem' : 'Connected'}</div>
          <div className="text-[13px] text-ink-3">{sync ? `Last sync ${time(sync.at)}` : 'Syncs automatically after every change'}</div>
        </div>
      </div>

      <p className={`mt-4 text-[14px] leading-relaxed ${sync?.error ? 'text-danger' : sync?.needsRestore ? 'text-ink' : 'text-ink-2'}`}>{sync?.error ?? statusLine}</p>

      {/* Recovery phrase: lets a wiped phone reconnect itself. */}
      {sync?.recoverySet && !editingPhrase ? (
        <button onClick={() => setEditingPhrase(true)} className="mt-4 flex w-full items-center gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-left text-[14px] text-ink-2">
          <KeyRound size={16} className="text-ink-3" aria-hidden />
          <span className="flex-1">Recovery phrase is set. If this phone is ever wiped, it can reconnect itself.</span>
          <span className="text-ink">Change</span>
        </button>
      ) : (
        <form
          className="mt-4 rounded-2xl bg-surface-2 p-4"
          onSubmit={(e) => {
            e.preventDefault()
            void run('Saving phrase…', async () => {
              await setRecoveryPhrase(phrase)
              setPhrase('')
              setEditingPhrase(false)
              setMsg({ text: 'Recovery phrase saved. Remember it: it isn’t shown again.' })
            })
          }}
        >
          <div className="flex items-center gap-1.5 text-[14px] font-medium">
            <KeyRound size={15} className="text-ink-3" aria-hidden /> {sync?.recoverySet ? 'New recovery phrase' : 'Set a recovery phrase'}
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
            If this phone’s storage is ever wiped, typing this reconnects it, with no pairing code. At least {MIN_PHRASE} characters, something only you know.
          </p>
          <input
            type="password"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="new-password"
            placeholder="A phrase you’ll remember"
            className={`mt-3 ${inputClass}`}
          />
          <button type="submit" disabled={!!busy || phrase.trim().length < MIN_PHRASE} className="mt-3 h-11 w-full rounded-full bg-ink text-sm font-bold text-black disabled:opacity-40">
            Save phrase
          </button>
        </form>
      )}

      <button
        onClick={() => run('Syncing…', async () => void (await syncCloud()))}
        disabled={!!busy}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-line text-sm font-semibold disabled:opacity-40"
      >
        <CloudUpload size={16} aria-hidden /> Sync now
      </button>

      {pending ? (
        <div className="mt-4 rounded-2xl border border-danger/40 bg-danger/10 p-4">
          <div className="font-display text-lg font-bold uppercase">Restore this backup?</div>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
            {time(pending.summary.exportedAt)}: {describe(pending.summary)}. It replaces what’s on this phone, but anything you’ve sealed here that isn’t in the backup is kept.
          </p>
          <div className="mt-4 flex gap-3">
            <button onClick={() => setPending(undefined)} disabled={!!busy} className="h-12 flex-1 rounded-full border border-line text-sm font-semibold">
              Back
            </button>
            <button
              onClick={() =>
                run('Restoring…', async () => {
                  await restoreFromCloud(pending.manifest, (done, total) => setBusy(`Downloading photos ${done}/${total}…`))
                  setPending(undefined)
                  setBackups(undefined)
                  setMsg({ text: 'Restored. Welcome back.' })
                })
              }
              disabled={!!busy}
              className="h-12 flex-1 rounded-full bg-danger text-sm font-bold text-black disabled:opacity-40"
            >
              Restore
            </button>
          </div>
        </div>
      ) : backups ? (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <div className="text-[14px] font-medium">Pick a backup to restore</div>
            <button onClick={() => setBackups(undefined)} className="h-9 px-2 text-[13px] text-ink-3">
              Close
            </button>
          </div>
          <ul className="mt-2 space-y-2">
            {backups.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => run('Opening backup…', async () => setPending(await fetchCloudBackup(b.id)))}
                  disabled={!!busy}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-left disabled:opacity-40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">
                      {time(b.createdAt)}
                      {b.summary.seals === mostSeals && mostSeals > 0 && <span className="ml-2 text-[12px] font-bold uppercase tracking-wide text-[#39d353]">Most complete</span>}
                    </span>
                    <span className="block text-[13px] text-ink-3">{describe(b.summary)}</span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <button
          onClick={() => run('Loading your backups…', async () => setBackups(await listCloudBackups()))}
          disabled={!!busy}
          className={`mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold disabled:opacity-40 ${sync?.needsRestore ? 'bg-ink text-black' : 'border border-line text-ink-2'}`}
        >
          <DownloadCloud size={16} aria-hidden /> Restore from cloud
        </button>
      )}

      <button
        onClick={() => (confirmDisconnect ? void disconnectCloud() : setConfirmDisconnect(true))}
        className={`mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm ${confirmDisconnect ? 'bg-danger/15 font-semibold text-danger' : 'text-ink-3'}`}
      >
        <Link2Off size={16} aria-hidden /> {confirmDisconnect ? 'Tap again to disconnect this phone' : 'Disconnect this phone'}
      </button>

      {(busy || msg) && (
        <p role="status" className={`mt-3 text-center text-[14px] ${msg?.error ? 'text-danger' : 'text-ink-2'}`}>
          {busy ?? msg?.text}
        </p>
      )}
    </>
  )
}
