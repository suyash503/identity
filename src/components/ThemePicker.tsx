import { Check, Shuffle } from 'lucide-react'
import { setSetting } from '../db'
import { useData } from '../data'
import { SHUFFLE, THEMES, resolveTheme, type Theme } from '../lib/theme'
import { SectionLabel } from './ui'

export function ThemePicker() {
  const { settings, today } = useData()
  const choice = (settings.theme as string | undefined) ?? THEMES[0].id
  const todays = resolveTheme(SHUFFLE, today)

  return (
    <>
      <SectionLabel>Look</SectionLabel>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => (
          <Swatch key={t.id} theme={t} selected={choice === t.id} onPick={() => setSetting('theme', t.id)} />
        ))}
      </div>
      <button
        role="radio"
        aria-checked={choice === SHUFFLE}
        onClick={() => setSetting('theme', SHUFFLE)}
        className={`mt-2 flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${choice === SHUFFLE ? 'border-ink bg-surface-2' : 'border-line bg-surface'}`}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-3">
          <Shuffle size={18} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">Shuffle daily</span>
          <span className="block text-[13px] text-ink-3">A different theme every day. Today: {todays.name}</span>
        </span>
        {choice === SHUFFLE && <Check size={18} aria-hidden />}
      </button>
    </>
  )
}

function Swatch({ theme, selected, onPick }: { theme: Theme; selected: boolean; onPick: () => void }) {
  const v = theme.vars
  return (
    <button
      role="radio"
      aria-checked={selected}
      aria-label={theme.name}
      onClick={onPick}
      className="relative overflow-hidden rounded-2xl p-2.5 text-left"
      style={{ background: v.bg, boxShadow: `inset 0 0 0 ${selected ? 2 : 1}px ${selected ? v.ink : v.line}` }}
    >
      <div aria-hidden className="absolute -left-4 -top-6 size-20 rounded-full opacity-70 blur-2xl" style={{ background: theme.glow }} />
      <div className="relative space-y-1.5">
        <div className="h-5 rounded-md" style={{ background: v.surface2 }} />
        <div className="flex gap-1">
          <div className="h-3 flex-1 rounded" style={{ background: v.surface3 }} />
          <div className="h-3 w-4 rounded" style={{ background: v.ink3 }} />
        </div>
      </div>
      <div className="relative mt-2 flex items-center justify-between">
        <span className="text-[12px] font-semibold" style={{ color: v.ink }}>
          {theme.name}
        </span>
        {selected && <Check size={14} style={{ color: v.ink }} aria-hidden />}
      </div>
    </button>
  )
}
