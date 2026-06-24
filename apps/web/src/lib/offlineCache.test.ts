import { describe, expect, it } from 'vitest'
import type { PersistedClient } from '@tanstack/react-query-persist-client'
import { createDexiePersister } from './offlineCache'

const sample: PersistedClient = {
  timestamp: 1,
  buster: 'v1',
  clientState: { mutations: [], queries: [] },
}

describe('Dexie offline persister', () => {
  it('round-trips the query cache through IndexedDB and clears it', async () => {
    const persister = createDexiePersister()
    expect(await persister.restoreClient()).toBeUndefined()

    await persister.persistClient(sample)
    const restored = await persister.restoreClient()
    expect(restored?.buster).toBe('v1')
    expect(restored?.timestamp).toBe(1)

    await persister.removeClient()
    expect(await persister.restoreClient()).toBeUndefined()
  })
})
