import { create } from 'zustand'
import { DEFAULT_SKIN, isMode, isSkinId, type Mode, type ResolvedMode, type SkinId } from '@reverie/core'

// Skin and light/dark MODE are independent axes, both persisted. localStorage gives an instant,
// flash-free apply (the index.html boot script reads the same keys pre-paint); the profile is the
// cross-device source of truth and is reconciled on sign-in via hydrate().
const SKIN_KEY = 'reverie.skin'
const MODE_KEY = 'reverie.mode'

function safeStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch {
    /* private mode / denied */
  }
  return null
}

function systemMode(): ResolvedMode {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark'
    : 'dark'
}

export function resolveMode(mode: Mode): ResolvedMode {
  return mode === 'system' ? systemMode() : mode
}

function readInitialSkin(): SkinId {
  const s = safeStorage()?.getItem(SKIN_KEY)
  return isSkinId(s) ? s : DEFAULT_SKIN
}
function readInitialMode(): Mode {
  const m = safeStorage()?.getItem(MODE_KEY)
  return isMode(m) ? m : 'system'
}

/** Reflect the active skin + resolved mode onto <html>. */
function apply(skin: SkinId, mode: Mode): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.skin = skin
    document.documentElement.dataset.mode = resolveMode(mode)
  }
}

interface SkinState {
  skin: SkinId
  mode: Mode
  resolvedMode: ResolvedMode
  setSkin: (skin: SkinId) => void
  setMode: (mode: Mode) => void
  /** Apply a profile-sourced choice (sign-in reconciliation); persists to localStorage too. */
  hydrate: (skin: SkinId, mode: Mode) => void
}

export const useSkin = create<SkinState>((set, get) => ({
  skin: readInitialSkin(),
  mode: readInitialMode(),
  resolvedMode: resolveMode(readInitialMode()),
  setSkin: (skin) => {
    apply(skin, get().mode)
    safeStorage()?.setItem(SKIN_KEY, skin)
    set({ skin })
  },
  setMode: (mode) => {
    apply(get().skin, mode)
    safeStorage()?.setItem(MODE_KEY, mode)
    set({ mode, resolvedMode: resolveMode(mode) })
  },
  hydrate: (skin, mode) => {
    apply(skin, mode)
    safeStorage()?.setItem(SKIN_KEY, skin)
    safeStorage()?.setItem(MODE_KEY, mode)
    set({ skin, mode, resolvedMode: resolveMode(mode) })
  },
}))

// Apply once on load (mirrors the pre-paint boot script), and keep 'system' mode live.
apply(useSkin.getState().skin, useSkin.getState().mode)
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => {
    const { mode, skin } = useSkin.getState()
    if (mode === 'system') {
      apply(skin, 'system')
      useSkin.setState({ resolvedMode: systemMode() })
    }
  })
}
