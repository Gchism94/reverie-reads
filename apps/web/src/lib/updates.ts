/**
 * Deploy-version handling. Every Vercel deploy replaces the previous build's hashed assets on the
 * domain, so a client born under an old deploy can strand: its lazy chunks 404 and its shell goes
 * stale. Two defenses:
 *  1. `initUpdateWatch` — polls `/version.json` (stamped with the build id at build time) when the
 *     tab regains focus and on a slow interval; a changed build id means a new deploy is live and
 *     the caller can offer a refresh.
 *  2. `installPreloadErrorReload` — Vite fires `vite:preloadError` when a dynamic import 404s
 *     (the stranded-client signature); reload once to pick up the new deploy instead of erroring.
 */

import { clearOfflineCache } from './offlineCache'

export const BUILD_ID = (import.meta.env.VITE_BUILD_ID as string | undefined) ?? 'dev'
/** Short, human-readable build stamp for the settings footer. */
export const BUILD_LABEL = BUILD_ID === 'dev' ? 'dev' : BUILD_ID.slice(0, 7)

const CHECK_EVERY = 15 * 60 * 1000
const RELOADED_FLAG = 'reverie-reloaded-for-update'

export async function fetchDeployedBuild(): Promise<string | null> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { build?: string }
    return typeof data.build === 'string' ? data.build : null
  } catch {
    return null
  }
}

export function isNewBuild(deployed: string | null, current: string = BUILD_ID): boolean {
  return deployed != null && deployed !== '' && deployed !== current
}

/**
 * Watch for a newer deploy; fires `onNewVersion` once. Signals, cheapest first: the tab regaining
 * focus, reconnecting, a slow interval, and — the strongest — the browser installing a new service
 * worker (a fresh sw.js means a deploy shipped). Each confirms against `/version.json`. Returns a
 * cleanup fn; no-op outside prod.
 */
export function initUpdateWatch(onNewVersion: () => void): () => void {
  if (!import.meta.env.PROD) return () => {}
  let notified = false
  const check = async () => {
    if (notified) return
    if (isNewBuild(await fetchDeployedBuild())) {
      notified = true
      onNewVersion()
    }
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') void check()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', () => void check())
  const timer = setInterval(() => void check(), CHECK_EVERY)

  // A new service worker installing is the earliest reliable "a deploy is live" signal.
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.addEventListener('updatefound', () => void check()))
    navigator.serviceWorker.addEventListener('controllerchange', () => void check())
  }

  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    clearInterval(timer)
  }
}

/**
 * Apply a pending update: clean apply-and-reload. Clears the persisted query cache (so the new
 * build never restores a stale, pre-migration query shape), nudges the service worker to fetch +
 * activate the newest shell, then reloads into it. Best-effort at each step — a failure still reloads.
 */
export async function applyUpdate(): Promise<void> {
  try {
    await clearOfflineCache()
  } catch {
    /* the build-id buster still discards it on load */
  }
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      await reg?.update()
    }
  } catch {
    /* the network-first shell fetch on reload still picks up new assets */
  }
  window.location.reload()
}

/** Reload once when a lazy chunk 404s after a deploy; a second failure surfaces normally. */
export function installPreloadErrorReload(): void {
  window.addEventListener('vite:preloadError', (event) => {
    // Offline there is no new deploy to pick up, so the reload cannot help — it just runs the whole
    // failing boot again and doubles time-to-error (measured 25.6s → 51.1s before the surrounding
    // fixes). Let the error fall through to the boundary that can actually render something.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    if (sessionStorage.getItem(RELOADED_FLAG)) return
    sessionStorage.setItem(RELOADED_FLAG, '1')
    event.preventDefault()
    window.location.reload()
  })
}
