// Themes: every surface colour is a CSS variable, so a theme is just a set of variables.
// All themes are dark, worn and warm on purpose: habit colours and photos are tuned for a dark canvas.
import { dayKeyOf } from './day'

export interface Theme {
  id: string
  name: string
  /** Soft colour washed across the top of the screen. */
  glow: string
  vars: {
    bg: string
    surface: string
    surface2: string
    surface3: string
    line: string
    ink: string
    ink2: string
    ink3: string
  }
}

export const THEMES: Theme[] = [
  {
    id: 'iron',
    name: 'Iron',
    glow: '#3a2a15',
    vars: { bg: '#12100d', surface: '#1a1712', surface2: '#221e17', surface3: '#2e281f', line: '#3d3529', ink: '#efe4cc', ink2: '#c2b497', ink3: '#968a73' },
  },
  {
    id: 'oxblood',
    name: 'Oxblood',
    glow: '#4a1712',
    vars: { bg: '#140b0a', surface: '#1d1110', surface2: '#261715', surface3: '#331f1c', line: '#442a26', ink: '#f2e2d2', ink2: '#c9ad9c', ink3: '#9c8174' },
  },
  {
    id: 'army',
    name: 'Army',
    glow: '#2f3517',
    vars: { bg: '#10110c', surface: '#181a12', surface2: '#202318', surface3: '#2b2f20', line: '#3a3f2b', ink: '#ebe6cf', ink2: '#bdb898', ink3: '#908c70' },
  },
  {
    id: 'navy',
    name: 'Navy',
    glow: '#16263d',
    vars: { bg: '#0c0f14', surface: '#13171e', surface2: '#1a1f28', surface3: '#242b36', line: '#323a47', ink: '#ece5d3', ink2: '#bab3a0', ink3: '#8e8978' },
  },
  {
    id: 'tobacco',
    name: 'Tobacco',
    glow: '#4d3010',
    vars: { bg: '#15100a', surface: '#1e1710', surface2: '#281f15', surface3: '#352a1c', line: '#473826', ink: '#f3e3c4', ink2: '#cdb48a', ink3: '#a08965' },
  },
  {
    id: 'gunmetal',
    name: 'Gunmetal',
    glow: '#2a2c2e',
    vars: { bg: '#111213', surface: '#18191b', surface2: '#202224', surface3: '#2a2c2f', line: '#383b3e', ink: '#e9e6dd', ink2: '#b8b4aa', ink3: '#8d8a82' },
  },
]

export const SHUFFLE = 'shuffle'
const STORAGE_KEY = 'identity.theme'

/** "shuffle" picks a different theme each day (changing at the 4 AM rollover). */
export function resolveTheme(choice: string | undefined, day = dayKeyOf()): Theme {
  if (choice === SHUFFLE) {
    let h = 0
    for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0
    return THEMES[h % THEMES.length]
  }
  return THEMES.find((t) => t.id === choice) ?? THEMES[0]
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  const v = theme.vars
  const set = (name: string, value: string) => root.style.setProperty(name, value)
  set('--color-bg', v.bg)
  set('--color-surface', v.surface)
  set('--color-surface-2', v.surface2)
  set('--color-surface-3', v.surface3)
  set('--color-line', v.line)
  set('--color-ink', v.ink)
  set('--color-ink-2', v.ink2)
  set('--color-ink-3', v.ink3)
  set('--color-glow', theme.glow)
  root.dataset.theme = theme.id
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', v.bg)
}

/** The saved choice lives in IndexedDB (and backups); this copy lets the first paint use it too. */
export function storedThemeChoice(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

export function rememberThemeChoice(choice: string) {
  try {
    localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // Private mode: the theme still applies, it just isn't pre-applied on the next launch.
  }
}
