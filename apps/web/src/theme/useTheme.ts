import { create } from 'zustand'

export type Theme = 'nocturne' | 'dawn'

const STORAGE_KEY = 'reverie.theme'

/** The other theme. Pure and tiny so it's trivial to unit test. */
export function nextTheme(theme: Theme): Theme {
  return theme === 'nocturne' ? 'dawn' : 'nocturne'
}

/** localStorage can be absent (SSR) or throw (private mode); never let it break theming. */
function safeStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch {
    /* access denied */
  }
  return null
}

function prefersLight(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: light)').matches
    : false
}

function readInitialTheme(): Theme {
  const stored = safeStorage()?.getItem(STORAGE_KEY)
  if (stored === 'nocturne' || stored === 'dawn') return stored
  return prefersLight() ? 'dawn' : 'nocturne'
}

/** Reflect the active theme onto <html data-theme> and persist the choice. */
function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme
  }
  safeStorage()?.setItem(STORAGE_KEY, theme)
}

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: readInitialTheme(),
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  toggleTheme: () => {
    const theme = nextTheme(get().theme)
    applyTheme(theme)
    set({ theme })
  },
}))
