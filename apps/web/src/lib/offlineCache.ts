import Dexie, { type Table } from 'dexie'
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client'

interface CacheRow {
  id: string
  client: PersistedClient
}

/** IndexedDB-backed store for the offline cache (the design system's chosen Dexie layer). */
class ReverieCacheDB extends Dexie {
  cache!: Table<CacheRow, string>
  constructor() {
    super('reverie-offline')
    this.version(1).stores({ cache: 'id' })
  }
}

const db = new ReverieCacheDB()

/**
 * The pre-scoping row key. Every row used to be written here, with no user id in it, so on a shared
 * device the next reader to boot restored the previous reader's whole library — 286 of user A's
 * book cards rendering for user B, and staying there (the restored entry is fresh for `staleTime`,
 * and nothing afterwards triggers a refetch). Kept only so the boot sweep can delete it.
 */
const LEGACY_KEY = 'react-query'

/** One row per reader. */
const rowKey = (userId: string): string => `react-query:${userId}`

/**
 * supabase-js derives its session storage key from the project URL:
 * `sb-${hostname.split('.')[0]}-auth-token`. Deriving it the same way here means no scanning and no
 * guessing — the key is a pure function of the env we already build with.
 */
function authStorageKey(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!url) return null
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
  } catch {
    return null
  }
}

/**
 * The signed-in reader's id, read SYNCHRONOUSLY from the persisted session — no network, no await
 * on auth. That is what lets the cache be scoped without re-ordering the providers or gating boot:
 * restoration already runs in `PersistQueryClientProvider`'s own effect and never blocked render,
 * so the only thing that needed fixing was *which row* it reads. Measured at ~0.1ms.
 *
 * auth-js stores the session as plain `JSON.stringify` and keeps `user` inline (no `userStorage`
 * option is set), so `user.id` is available here.
 *
 * FAILS CLOSED, deliberately. A missing key, private-mode denial, malformed JSON, or a future
 * encoded storage format all return null — which disables the mirror rather than falling back to an
 * unscoped row. Losing the offline cache is a degradation; showing one reader another's library is
 * a defect.
 */
export function storedUserId(): string | null {
  const key = authStorageKey()
  if (!key || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { user?: { id?: unknown } } | null
    const id = parsed?.user?.id
    return typeof id === 'string' && id ? id : null
  } catch {
    return null
  }
}

/**
 * A TanStack Query persister backed by Dexie/IndexedDB — the local-first mirror. The query
 * cache (the user's library, lists, reads, clubs…) is written here on every change and
 * restored on load, so the app opens and reads while offline. Optimistic mutations made
 * offline pause and flush automatically on reconnect.
 *
 * Every entry point resolves the reader at CALL time rather than closing over an id, because one
 * persister instance is created at module scope and outlives any number of sign-ins.
 *
 * With no readable session every method is a no-op: restore resolves `undefined`, which is exactly
 * the first-visit path. Note the consequence — signing in does not retro-restore that reader's row
 * within the same page load, because the provider restores once on mount and never again. Their
 * queries simply fetch, and the row restores on the next boot. That is the price of scoping without
 * a boot gate, and it is the right side of the trade.
 */
export function createDexiePersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      const id = storedUserId()
      if (!id) return // never write an unscoped row — that is the bug this fixes
      await db.cache.put({ id: rowKey(id), client })
    },
    restoreClient: async () => {
      const id = storedUserId()
      if (!id) return undefined
      return (await db.cache.get(rowKey(id)))?.client
    },
    removeClient: async () => {
      const id = storedUserId()
      if (!id) return
      await db.cache.delete(rowKey(id))
    },
  }
}

/**
 * Drop the CURRENT reader's persisted query cache (used by the update-apply path). The buster
 * already discards it on the next new-build load, but clearing it BEFORE the reload guarantees the
 * reloaded client can't momentarily restore a stale, pre-migration query shape.
 *
 * Scoped, so `applyUpdate()` deletes the row the reloading client would actually restore rather
 * than a fixed key that no longer exists.
 */
export async function clearOfflineCache(): Promise<void> {
  const id = storedUserId()
  if (!id) return
  await db.cache.delete(rowKey(id))
}

/**
 * Leave nothing behind — the sign-out primitive. Clears the whole table rather than one row: at
 * sign-out the point is that no library data remains for the next reader, and a table clear also
 * sweeps the legacy unscoped row and any other reader's rows on a shared device.
 *
 * Deliberately NOT keyed to the current reader: auth-js removes the stored session before it emits
 * SIGNED_OUT, so by the time this runs there is no id left to scope by.
 */
export async function clearAllOfflineCaches(): Promise<void> {
  await db.cache.clear()
}

/**
 * One-time boot sweep of the pre-scoping row. A reader who never signs out again would otherwise
 * keep a full copy of their library under the unscoped key forever — orphaned, unreadable by the
 * scoped persister, and still sitting in IndexedDB. Cheap and idempotent; a no-op once swept.
 */
export async function evictLegacyOfflineCache(): Promise<void> {
  await db.cache.delete(LEGACY_KEY)
}
