import { useEffect, useState } from 'react'
import { Cloud, CloudOff, CloudUpload, DownloadCloud, Link2Off, RefreshCw } from 'lucide-react'
import { useData } from '../data'
import type { BackupSummary, Manifest } from '../lib/backup'
import { disconnectCloud, fetchCloudBackup, pollPairing, restoreFromCloud, startPairing, syncCloud, type CloudSyncState } from '../lib/cloud'
import { SectionLabel } from './ui'

type Pairing = { id: string; code: string; expiresAt: number }

const time = (t: number) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

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

function Connect() {
  const [pairing, setPairing] = useState<Pairing>()
  const [status, setStatus] = useState<string>()
  const [error, setError] = useState<string>()
  const [now, setNow] = useState(Date.now)

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

  const start = async () => {
    setError(undefined)
    setStatus('Getting a code…')
    try {
      setPairing(await startPairing())
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
      <button
        onClick={start}
        disabled={!!status}
        className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink font-display text-base font-bold uppercase tracking-[0.14em] text-black disabled:opacity-40"
      >
        <Cloud size={20} aria-hidden /> Connect this phone
      </button>
      {(status || error) && <p className={`mt-3 text-center text-[14px] ${error ? 'text-danger' : 'text-ink-2'}`}>{error ?? status}</p>}
    </>
  )
}

function Connected() {
  const { settings } = useData()
  const sync = settings.cloudSync as CloudSyncState | undefined
  const [busy, setBusy] = useState<string>()
  const [msg, setMsg] = useState<{ text: string; error?: boolean }>()
  const [pending, setPending] = useState<{ manifest: Manifest; summary: BackupSummary }>()
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

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

  const photosLine = !sync
    ? 'First sync starting…'
    : sync.needsRestore
      ? 'The cloud already has a backup and this phone is empty. Restore it to bring your history here.'
    : sync.photoStorage
      ? `${sync.photosSafe ?? 0} photos safe`
      : `History is safe. ${sync.photosPending ?? 0} photos wait for photo storage (R2) to be turned on.`

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

      <p className={`mt-4 text-[14px] leading-relaxed ${sync?.error ? 'text-danger' : 'text-ink-2'}`}>{sync?.error ?? photosLine}</p>

      <button
        onClick={() => run('Syncing…', async () => void (await syncCloud()))}
        disabled={!!busy}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-line text-sm font-semibold disabled:opacity-40"
      >
        <CloudUpload size={16} aria-hidden /> Sync now
      </button>

      {!pending ? (
        <button
          onClick={() => run('Checking the cloud…', async () => setPending(await fetchCloudBackup()))}
          disabled={!!busy}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-line text-sm font-semibold text-ink-2 disabled:opacity-40"
        >
          <DownloadCloud size={16} aria-hidden /> Restore from cloud
        </button>
      ) : (
        <div className="mt-4 rounded-2xl border border-danger/40 bg-danger/10 p-4">
          <div className="font-display text-lg font-bold uppercase">Replace everything?</div>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
            Cloud backup from {time(pending.summary.exportedAt)}: {pending.summary.seals} seals over {pending.summary.days} days,{' '}
            {pending.summary.photos} photos. Everything currently on this phone will be replaced.
          </p>
          <div className="mt-4 flex gap-3">
            <button onClick={() => setPending(undefined)} disabled={!!busy} className="h-12 flex-1 rounded-full border border-line text-sm font-semibold">
              Cancel
            </button>
            <button
              onClick={() =>
                run('Restoring…', async () => {
                  await restoreFromCloud(pending.manifest, (done, total) => setBusy(`Downloading photos ${done}/${total}…`))
                  setPending(undefined)
                  setMsg({ text: 'Restored from the cloud. Welcome back.' })
                })
              }
              disabled={!!busy}
              className="h-12 flex-1 rounded-full bg-danger text-sm font-bold text-black disabled:opacity-40"
            >
              Restore
            </button>
          </div>
        </div>
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
