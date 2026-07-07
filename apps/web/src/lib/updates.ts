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

export const BUILD_ID = (import.meta.env.VITE_BUILD_ID as string | undefined) ?? 'dev'

const CHECK_EVERY = 30 * 60 * 1000
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

/** Watch for a newer deploy; fires `onNewVersion` once. Returns a cleanup fn. No-op outside prod. */
export function initUpdateWatch(onNewVersion: () => void): () => void {
  if (!import.meta.env.PROD) return () => {}
  let notified = false
  const check = async () => {
    if (notified || document.visibilityState !== 'visible') return
    if (isNewBuild(await fetchDeployedBuild())) {
      notified = true
      onNewVersion()
    }
  }
  const onVisible = () => void check()
  document.addEventListener('visibilitychange', onVisible)
  const timer = setInterval(() => void check(), CHECK_EVERY)
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    clearInterval(timer)
  }
}

/** Reload once when a lazy chunk 404s after a deploy; a second failure surfaces normally. */
export function installPreloadErrorReload(): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (sessionStorage.getItem(RELOADED_FLAG)) return
    sessionStorage.setItem(RELOADED_FLAG, '1')
    event.preventDefault()
    window.location.reload()
  })
}
