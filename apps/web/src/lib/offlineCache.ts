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
const KEY = 'react-query'

/**
 * A TanStack Query persister backed by Dexie/IndexedDB — the local-first mirror. The query
 * cache (the user's library, lists, reads, clubs…) is written here on every change and
 * restored on load, so the app opens and reads while offline. Optimistic mutations made
 * offline pause and flush automatically on reconnect.
 */
export function createDexiePersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      await db.cache.put({ id: KEY, client })
    },
    restoreClient: async () => (await db.cache.get(KEY))?.client,
    removeClient: async () => {
      await db.cache.delete(KEY)
    },
  }
}
