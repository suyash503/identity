import { useState } from 'react'
import { Bell, BellOff, Send } from 'lucide-react'
import { setSetting } from '../db'
import { useData } from '../data'
import { DEFAULT_PUSH_PREFS, disablePush, enablePush, sendTestPush, type PushPrefs } from '../lib/cloud'
import { RIVAL } from '../lib/alankrit'
import { SectionLabel } from './ui'

const OPTIONS: { key: keyof PushPrefs; title: string; detail: string }[] = [
  { key: 'rival', title: `${RIVAL.name}’s moves`, detail: 'When he seals or skips a habit' },
  { key: 'danger', title: 'Danger days', detail: '7 PM and 10:30 PM when you missed yesterday' },
  { key: 'evening', title: 'Evening check', detail: '9 PM, if anything is still open' },
]

export function NotificationsSection() {
  const { settings } = useData()
  const push = settings.push as { enabled: boolean; prefs: PushPrefs } | undefined
  const enabled = !!push?.enabled
  const prefs = push?.prefs ?? DEFAULT_PUSH_PREFS
  const paired = !!settings.cloudToken
  const [busy, setBusy] = useState<string>()
  const [msg, setMsg] = useState<{ text: string; error?: boolean }>()

  const run = async (label: string, fn: () => Promise<void>, done?: string) => {
    setBusy(label)
    setMsg(undefined)
    try {
      await fn()
      if (done) setMsg({ text: done })
    } catch (e) {
      setMsg({ text: (e as Error).message, error: true })
    } finally {
      setBusy(undefined)
    }
  }

  const toggle = (key: keyof PushPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] }
    if (enabled) void run('Saving…', () => enablePush(next))
    else void setSetting('push', { enabled: false, prefs: next })
  }

  return (
    <>
      <SectionLabel>Notifications</SectionLabel>
      <div className="rounded-[24px] border border-line bg-surface p-5">
        <div className="flex items-center gap-3">
          <div
            className="grid size-12 shrink-0 place-items-center rounded-2xl"
            style={enabled ? { background: 'rgb(217 70 239 / .14)', color: RIVAL.color } : { background: 'var(--color-surface-2)', color: 'var(--color-ink-3)' }}
          >
            {enabled ? <Bell size={24} aria-hidden /> : <BellOff size={24} aria-hidden />}
          </div>
          <div className="min-w-0">
            <div className="font-display text-xl font-bold uppercase leading-tight">{enabled ? 'On' : 'Off'}</div>
            <div className="text-[13px] text-ink-3">Sent by your server, even when the app is closed.</div>
          </div>
        </div>

        {!paired ? (
          <p className="mt-4 rounded-2xl bg-surface-2 px-4 py-3 text-[14px] leading-relaxed text-ink-2">
            Connect <span className="text-ink">Cloud backup</span> below first. Your server is what sends the notifications.
          </p>
        ) : !enabled ? (
          <button
            onClick={() => run('Turning on…', () => enablePush(prefs), 'Notifications are on.')}
            disabled={!!busy}
            className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink font-display text-base font-bold uppercase tracking-[0.14em] text-black disabled:opacity-40"
          >
            <Bell size={20} aria-hidden /> Turn on notifications
          </button>
        ) : (
          <div className="mt-5 flex gap-3">
            <button
              onClick={() => run('Sending…', sendTestPush, 'Test sent. It should arrive in a few seconds.')}
              disabled={!!busy}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-line text-sm font-semibold disabled:opacity-40"
            >
              <Send size={16} aria-hidden /> Send a test
            </button>
            <button
              onClick={() => run('Turning off…', () => disablePush(prefs), 'Notifications are off.')}
              disabled={!!busy}
              className="h-12 flex-1 rounded-full border border-line text-sm font-semibold text-ink-2 disabled:opacity-40"
            >
              Turn off
            </button>
          </div>
        )}

        <div className="mt-5 divide-y divide-line">
          {OPTIONS.map((o) => (
            <div key={o.key} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="text-[15px] font-medium">{o.title}</div>
                <div className="text-[13px] text-ink-3">{o.detail}</div>
              </div>
              <Switch on={prefs[o.key]} onChange={() => toggle(o.key)} label={o.title} disabled={!!busy} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-ink-3">Quiet from 11:30 PM to 7 AM.</p>

        {(busy || msg) && (
          <p role="status" className={`mt-3 text-center text-[14px] ${msg?.error ? 'text-danger' : 'text-ink-2'}`}>
            {busy ?? msg?.text}
          </p>
        )}
      </div>
    </>
  )
}

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`relative h-8 w-[52px] shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-ink' : 'bg-surface-3'}`}
    >
      <span className={`absolute top-1 size-6 rounded-full transition-all ${on ? 'left-[24px] bg-black' : 'left-1 bg-ink-3'}`} />
    </button>
  )
}
