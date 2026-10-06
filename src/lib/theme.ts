// Themes: every surface colour is a CSS variable, so a theme is just a set of variables.
// All themes are dark on purpose: habit colours and photos are tuned for a dark canvas.
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
    id: 'midnight',
    name: 'Midnight',
    glow: '#1d1d33',
    vars: { bg: '#000000', surface: '#0c0c0f', surface2: '#141418', surface3: '#1f1f26', line: '#26262e', ink: '#f5f5f7', ink2: '#a8a8b3', ink3: '#85858f' },
  },
  {
    id: 'ember',
    name: 'Ember',
    glow: '#4a1f0c',
    vars: { bg: '#0e0907', surface: '#17100c', surface2: '#1f1611', surface3: '#2a1e17', line: '#35271e', ink: '#f8efe8', ink2: '#cbb8aa', ink3: '#a08d80' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    glow: '#0d2d5c',
    vars: { bg: '#050a12', surface: '#0a1320', surface2: '#101b2b', surface3: '#182538', line: '#213149', ink: '#eef4ff', ink2: '#a7b8d1', ink3: '#8194af' },
  },
  {
    id: 'forest',
    name: 'Forest',
    glow: '#0d3a25',
    vars: { bg: '#050c09', surface: '#0a1611', surface2: '#101f18', surface3: '#182a21', line: '#21362b', ink: '#eef8f2', ink2: '#aac4b6', ink3: '#84a293' },
  },
  {
    id: 'plum',
    name: 'Plum',
    glow: '#3b1559',
    vars: { bg: '#0b0710', surface: '#140e1c', surface2: '#1b1426', surface3: '#251c33', line: '#30263f', ink: '#f6f0ff', ink2: '#bbb0cd', ink3: '#9486aa' },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    glow: '#2c2c36',
    vars: { bg: '#111113', surface: '#19191d', surface2: '#212126', surface3: '#2b2b32', line: '#34343c', ink: '#f4f4f6', ink2: '#b2b2bd', ink3: '#8e8e9a' },
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
