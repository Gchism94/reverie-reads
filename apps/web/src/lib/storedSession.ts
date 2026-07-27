import { captureMessage } from '@reverie/core'
import type { Session } from '@supabase/supabase-js'

/**
 * Synchronous access to the session supabase-js has persisted.
 *
 * This is the load-bearing primitive for two fixes. Boot no longer waits on a network round-trip
 * to know who the reader is — the answer is already in localStorage, costs ~0.1ms, and cannot
 * fail because the network is down. And the offline cache keys its rows off the same read.
 *
 * supabase-js derives its storage key from the project URL as
 * `sb-${hostname.split('.')[0]}-auth-token`, and auth-js writes the value with plain
 * `JSON.stringify` (no base64 wrapper in 2.x) keeping `user` inline, since no `userStorage`
 * option is configured. Both are verified against the installed library rather than assumed.
 */
export function authStorageKey(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!url) return null
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
  } catch {
    return null
  }
}

/**
 * Three outcomes, deliberately distinct.
 *
 * `none` and `unreadable` used to collapse into the same silent null. That was safe but blind: if
 * a future auth-js switched to an encoded storage format, every reader would quietly lose their
 * offline cache and boot would quietly stop recognising them, and nothing would ever say so. A key
 * that is PRESENT but unparseable is a different event from no key at all, and it is reported.
 */
export type StoredSession =
  | { kind: 'none' }
  | { kind: 'unreadable'; reason: string }
  | { kind: 'session'; session: Session }

/** Reported at most once per page load — a broken storage format would otherwise fire on every
 *  persist, every restore and every boot, and burn the error quota to say one thing. */
let reportedUnreadable = false

export function readStoredSession(): StoredSession {
  const key = authStorageKey()
  if (!key || typeof window === 'undefined') return { kind: 'none' }

  let raw: string | null
  try {
    raw = window.localStorage.getItem(key)
  } catch {
    // Private mode / storage denied. Not a format problem, so not worth reporting.
    return { kind: 'none' }
  }
  if (!raw) return { kind: 'none' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return unreadable('auth key present but not JSON — storage format may have changed')
  }

  const session = parsed as Session | null
  if (!session || typeof session !== 'object') {
    return unreadable('auth key parsed to a non-object')
  }
  if (typeof session.user?.id !== 'string' || !session.user.id) {
    return unreadable('auth key parsed but carries no user.id — session shape may have changed')
  }
  return { kind: 'session', session }
}

function unreadable(reason: string): StoredSession {
  if (!reportedUnreadable) {
    reportedUnreadable = true
    // Deliberately no token material in the report — only the shape observation.
    captureMessage(`storedSession: ${reason}`, { kind: 'auth-storage-format' })
  }
  return { kind: 'unreadable', reason }
}

/** The persisted session, or null when there is none or it cannot be read. */
export const storedSession = (): Session | null => {
  const r = readStoredSession()
  return r.kind === 'session' ? r.session : null
}

/** The signed-in reader's id, or null. */
export const storedUserId = (): string | null => storedSession()?.user.id ?? null

/** Test seam: the once-per-load report guard would otherwise leak between cases. */
export function resetUnreadableReportForTests(): void {
  reportedUnreadable = false
}
