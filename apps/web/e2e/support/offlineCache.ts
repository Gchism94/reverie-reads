import type { Page } from '@playwright/test'

/** The Dexie database backing the persisted TanStack Query cache (`lib/offlineCache.ts`). */
const OFFLINE_DB = 'reverie-offline'

/**
 * Keep this page's persisted query cache empty for every document it loads.
 *
 * Specs used to do `await page.evaluate(() => indexedDB.deleteDatabase('reverie-offline'))` at the
 * end of sign-in, which looks equivalent and is not: it deletes the database while the app is still
 * running, and the persister writes on EVERY query-cache `added`/`removed`/`updated` event with no
 * throttle (`query-persist-client-core/persist.js`). So any query still in flight when the delete
 * lands re-creates the row a moment later — capturing whatever the spec had just torn down.
 *
 * That is not theoretical. `state-pills.spec.ts` deletes every list in its seed, signs in (the home
 * route fetches `lists` and `list_items`, both empty), deletes the database, then creates a shelf
 * out of band and navigates to it. Under load the boot queries resolved AFTER the delete, re-wrote
 * the row with the empty lists, and the next full-page navigation restored them. `hydrate()`
 * preserves `dataUpdatedAt`, so a seconds-old snapshot is inside `staleTime` and therefore FRESH —
 * no refetch on mount, `refetchOnWindowFocus` off, nothing to correct it. The shelf rendered
 * "isn't here anymore" for its whole 20s budget. It failed on two unrelated branches this way.
 *
 * An init script cannot lose that race. It runs before any script in a NEW document, and
 * IndexedDB serializes per database: the app's own `open()` queues behind this pending delete and
 * opens the fresh, empty database that results. Every full-page navigation re-runs it, so no
 * snapshot written by the previous document survives into the next one — which is precisely the
 * hop the old idiom left unguarded.
 *
 * Call BEFORE the first `page.goto`. SPA navigations do not re-run init scripts, and do not need to:
 * they never restore the cache, because the provider restores once per document.
 */
export async function keepOfflineCacheEmpty(page: Page): Promise<void> {
  await page.addInitScript((db: string) => {
    indexedDB.deleteDatabase(db)
  }, OFFLINE_DB)
}
