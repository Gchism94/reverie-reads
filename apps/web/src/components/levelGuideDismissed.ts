import { useEffect, useState } from 'react'

/**
 * "I have read these, stop showing me" — the level guide's dismissal flag.
 *
 * ── ONE FLAG, BOTH AXES, THIS DEVICE ────────────────────────────────────────────────────────────
 * Spice and Darkness are one feature to the reader, so dismissing one guide must not leave the
 * other popping. One key covers both.
 *
 * PER-DEVICE ON PURPOSE. This is a convenience flag, not reader data. It does not warrant the
 * `profiles` column and migration that `hideIntensity` earned: losing it costs one extra dismissal
 * on a new device, whereas syncing it costs a schema change plus a write on every close. Key style
 * matches useSkin's `reverie.skin` / `reverie.mode`.
 *
 * ── A LIVE FLAG, NOT A CONSTANT READ AT IMPORT ──────────────────────────────────────────────────
 * "One flag for both axes" has to reach both MOUNTED components: dismissing Spice's guide must
 * quiet Darkness's picker in the same render pass. A module constant read once at import cannot do
 * that — the other picker would keep popping until a reload, which is the exact behaviour the
 * shared flag exists to prevent. Hence the subscriber set.
 *
 * ── STORAGE FAILURE IS NOT AN ERROR PATH ────────────────────────────────────────────────────────
 * Private mode and denied storage throw on plain access, so both sides are guarded and both fail
 * toward SHOWING the guide: a reader who cannot persist the dismissal sees it again next session,
 * which is mildly repetitive and always correct. Nothing is ever unreachable — the picker's
 * "What do the levels mean?" link opens it regardless of this flag.
 *
 * It lives in its own module rather than beside the component so the component file exports only
 * components (react-refresh), and so the test seam below is not a stray export on a UI file.
 */
const GUIDE_DISMISSED_KEY = 'reverie.levelGuideDismissed'

function safeStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch {
    /* private mode / denied */
  }
  return null
}

function read(): boolean {
  try {
    return safeStorage()?.getItem(GUIDE_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

let dismissedFlag = read()
const subscribers = new Set<() => void>()

export function rememberGuideDismissed(): void {
  dismissedFlag = true
  try {
    safeStorage()?.setItem(GUIDE_DISMISSED_KEY, '1')
  } catch {
    /* storage denied — the in-memory flag still holds for this session */
  }
  for (const notify of subscribers) notify()
}

export function useGuideDismissed(): boolean {
  const [value, setValue] = useState(dismissedFlag)
  useEffect(() => {
    const notify = () => setValue(dismissedFlag)
    subscribers.add(notify)
    return () => {
      subscribers.delete(notify)
    }
  }, [])
  return value
}

/** Test seam — the sanctioned `ForTests` suffix. The flag is module state by design, so a suite
 *  needs a way to put it back between cases; nothing in the app calls this. */
export function resetLevelGuideDismissedForTests(): void {
  dismissedFlag = false
  try {
    safeStorage()?.removeItem(GUIDE_DISMISSED_KEY)
  } catch {
    /* ignore */
  }
  for (const notify of subscribers) notify()
}
