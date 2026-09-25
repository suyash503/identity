import { useEffect, useState } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { db, setSetting, type Habit } from '../db'
import { useData } from '../data'
import { Eyebrow, HabitIcon, Overlay, SectionLabel } from '../components/ui'
import { fmtDay } from '../lib/day'
import { syncGithub, type GithubSyncState } from '../lib/github'

export function Settings({ onClose }: { onClose: () => void }) {
  const { habits, settings, ix } = useData()
  const sync = settings.githubSync as GithubSyncState | undefined
  const [syncing, setSyncing] = useState(false)
  const [storage, setStorage] = useState<{ usedMb: number; persisted: boolean }>()

  useEffect(() => {
    void (async () => {
      const est = await navigator.storage?.estimate?.()
      const persisted = (await navigator.storage?.persisted?.()) ?? false
      setStorage({ usedMb: (est?.usage ?? 0) / 1_048_576, persisted })
    })()
  }, [])

  const syncNow = async () => {
    const user = settings.githubUser as string | undefined
    if (!user) return
    setSyncing(true)
    await syncGithub(user, (settings.githubToken as string) || undefined, ix.startDay)
    setSyncing(false)
  }

  return (
    <Overlay label="Settings" onClose={onClose}>
      <div className="flex h-12 items-center">
        <button onClick={onClose} aria-label="Back" className="-ml-2 grid size-11 place-items-center rounded-full text-ink-2 active:bg-surface-2">
          <ArrowLeft size={24} />
        </button>
      </div>
      <h1 className="mt-2 font-display text-[56px] font-extrabold uppercase leading-[0.85] tracking-tight">Settings</h1>

      <SectionLabel>Identities</SectionLabel>
      <div className="space-y-3">
        {habits.map((h) => (
          <HabitEditor key={h.id} habit={h} />
        ))}
      </div>

      <SectionLabel>GitHub auto-seal</SectionLabel>
      <div className="space-y-3 rounded-[24px] border border-line bg-surface p-5">
        <Field
          label="Username"
          value={(settings.githubUser as string) ?? ''}
          placeholder="your-github-username"
          onSave={(v) => setSetting('githubUser', v.trim())}
        />
        <Field
          label="Token (optional)"
          type="password"
          value={(settings.githubToken as string) ?? ''}
          placeholder="Only needed for private repos"
          onSave={(v) => setSetting('githubToken', v.trim())}
        />
        <p className="text-[13px] leading-relaxed text-ink-3">
          Any push since Day 1 seals GitHub at the minimum level. A token lets private-repo pushes count too. It never leaves this phone.
        </p>
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className={`text-[13px] ${sync?.error ? 'text-danger' : 'text-ink-2'}`}>
            {!settings.githubUser
              ? 'Not connected'
              : sync?.error
                ? sync.error
                : sync
                  ? `Synced ${new Date(sync.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · ${sync.pushesToday ?? 0} push${sync.pushesToday === 1 ? '' : 'es'} today`
                  : 'Waiting for first sync'}
          </span>
          <button
            onClick={syncNow}
            disabled={!settings.githubUser || syncing}
            className="flex h-11 shrink-0 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold disabled:opacity-40"
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} aria-hidden /> Sync now
          </button>
        </div>
      </div>

      <SectionLabel>Your data</SectionLabel>
      <div className="divide-y divide-line rounded-[24px] border border-line bg-surface px-5">
        <Row label="Day 1" value={fmtDay(ix.startDay, { day: 'numeric', month: 'long', year: 'numeric' })} />
        <Row label="Day ends at" value="4:00 AM" />
        <Row label="Stored on this phone" value={storage ? `${storage.usedMb.toFixed(1)} MB` : '—'} />
        <Row label="Protected from cleanup" value={storage ? (storage.persisted ? 'Yes' : 'Not yet (install the app)') : '—'} />
      </div>
      <p className="mt-3 px-1 text-[13px] leading-relaxed text-ink-3">
        Everything lives on this phone and works offline. Backup and export are coming in the next phase.
      </p>

      {import.meta.env.DEV && <DevTools />}
    </Overlay>
  )
}

function HabitEditor({ habit }: { habit: Habit }) {
  const save = (field: 'identity' | 'minimum' | 'full') => (v: string) => v.trim() && db.habits.update(habit.id, { [field]: v.trim() })
  return (
    <details className="group rounded-[24px] border border-line bg-surface">
      <summary className="flex h-16 cursor-pointer list-none items-center gap-3 px-5">
        <span style={{ color: habit.color }}>
          <HabitIcon habit={habit} size={20} />
        </span>
        <span className="flex-1 font-display text-xl font-bold uppercase tracking-wide">{habit.name}</span>
        <span className="text-sm text-ink-3 group-open:hidden">Edit</span>
        <span className="hidden text-sm text-ink-3 group-open:inline">Close</span>
      </summary>
      <div className="space-y-3 px-5 pb-5">
        <Field label="Identity" value={habit.identity} onSave={save('identity')} />
        <Field label="Bare minimum" value={habit.minimum} onSave={save('minimum')} />
        <Field label="Full version" value={habit.full} onSave={save('full')} />
      </div>
    </details>
  )
}

function Field({ label, value, onSave, placeholder, type = 'text' }: { label: string; value: string; onSave: (v: string) => unknown; placeholder?: string; type?: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <label className="block">
      <Eyebrow className="mb-1.5">{label}</Eyebrow>
      <input
        type={type}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onSave(draft)}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3.5 text-[16px] text-ink placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
      />
    </label>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <span className="text-[15px] text-ink-2">{label}</span>
      <span className="text-right text-[15px] font-medium">{value}</span>
    </div>
  )
}

function DevTools() {
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    await fn()
    setBusy(false)
  }
  return (
    <>
      <SectionLabel color="#ffc53d">Developer</SectionLabel>
      <div className="flex gap-3">
        <button
          disabled={busy}
          onClick={() => run(async () => (await import('../lib/demo')).loadDemo())}
          className="h-12 flex-1 rounded-full border border-line text-sm font-semibold disabled:opacity-40"
        >
          {busy ? 'Working…' : 'Load demo data'}
        </button>
        <button
          disabled={busy}
          onClick={() => run(async () => (await import('../lib/demo')).resetAll())}
          className="h-12 flex-1 rounded-full border border-danger/50 text-sm font-semibold text-danger disabled:opacity-40"
        >
          Reset everything
        </button>
      </div>
    </>
  )
}
