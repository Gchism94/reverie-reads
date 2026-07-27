import { supabase } from './supabase'
import { authStorageKey } from './storedSession'

/**
 * Signing out with no connectivity.
 *
 * supabase's `_signOut` POSTs to `/logout` FIRST and returns early — without calling
 * `_removeSession()` — when that request fails with anything other than 404/401/403. Offline, that
 * means the reader taps Sign out, nothing happens, and they walk away from a shared device still
 * signed in with their library on screen. Measured: session `true` before and after, IndexedDB row
 * intact, library still rendered; the same tap online clears all three.
 *
 * No public API removes the local session without the round trip — all three `scope` values POST,
 * and `scope: 'others'` deliberately skips local removal. So this reaches past the library, and
 * does it in the order that matters.
 */

/** Set when a sign-out completed locally only, so the front door can say so honestly. One-shot. */
const LOCAL_SIGNOUT_FLAG = 'reverie.signed-out-locally'

export function takeLocalSignOutNotice(): boolean {
  try {
    if (sessionStorage.getItem(LOCAL_SIGNOUT_FLAG) !== '1') return false
    sessionStorage.removeItem(LOCAL_SIGNOUT_FLAG)
    return true
  } catch {
    return false
  }
}

/**
 * Best-effort server revoke, from an IN-MEMORY token only.
 *
 * The refresh/access token is deliberately NOT persisted for a queued logout. Parking a live
 * credential in unprotected storage on a shared device is a worse exposure than the one it would
 * close — the whole point of this path is that the device should hold nothing. If connectivity
 * returns while this page is still open we spend the copy we already have in memory; if the tab
 * closes first the copy dies with it and the server session simply expires on its own.
 */
function revokeOnReconnect(accessToken: string | null): void {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!accessToken || !url || !anon || typeof window === 'undefined') return

  let token: string | null = accessToken
  const fire = () => {
    const t = token
    token = null // spend once, then forget — never reachable again
    window.removeEventListener('online', fire)
    if (!t) return
    void fetch(`${url}/auth/v1/logout?scope=global`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${t}` },
      keepalive: true,
    }).catch(() => {
      /* best effort — the server session expires on its own */
    })
  }
  window.addEventListener('online', fire)
}

/**
 * Sign out on THIS DEVICE when the server cannot be reached.
 *
 * Order is the whole fix. `stopAutoRefresh()` comes first: removing the storage key alone would
 * leave auth-js holding the session in memory with its refresh ticker running, and on reconnect it
 * could refresh and re-persist — silently signing the reader back in on a device they believe they
 * left. The ticker is stopped, then the key is removed, then the caller clears the caches.
 */
export async function signOutLocally(accessToken: string | null): Promise<void> {
  try {
    await supabase.auth.stopAutoRefresh()
  } catch {
    /* stopping the ticker is best-effort; the key removal below still strands any refresh */
  }

  const key = authStorageKey()
  if (key) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* nothing else can be done if storage is denied */
    }
  }

  try {
    sessionStorage.setItem(LOCAL_SIGNOUT_FLAG, '1')
  } catch {
    /* the notice is a courtesy, not part of signing out */
  }

  revokeOnReconnect(accessToken)
}
