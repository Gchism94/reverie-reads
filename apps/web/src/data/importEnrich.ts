import type { Book } from '@reverie/core'
import { supabase } from '../lib/supabase'
import { bulkComplete } from './enrichLibrary'
import { booksKey } from './books'
import type { QueryClient } from '@tanstack/react-query'

// Cover handoff (docs/task-import-quality.md §3, PR #50): a fresh import leaves missing covers as the
// skin-tokened placeholder immediately; this kicks the enrichment pass (Google Books/Open Library →
// ingest pipeline) to backfill covers + pub data for the JUST-IMPORTED books first. Best-effort and
// fire-and-forget — enrichment failures degrade to the honest placeholder, never a wrong-cover guess.
// bulkComplete's own guards apply: it fills only blanks, never overwrites a user-chosen cover, and
// respects the per-book recheck window, so a re-import doesn't re-hammer the sources.

/** Enrich the imported books (cover + metadata backfill), then refresh the books cache. */
export async function enrichImported(qc: QueryClient, importedIds: string[]): Promise<void> {
  if (!importedIds.length) return
  const wanted = new Set(importedIds)
  const all = qc.getQueryData<Book[]>(booksKey) ?? (await fetchBooks())
  const batch = all.filter((b) => wanted.has(b.id))
  if (!batch.length) return
  await bulkComplete(batch, () => {}, () => false)
  await qc.invalidateQueries({ queryKey: booksKey })
}

async function fetchBooks(): Promise<Book[]> {
  // Fallback when the cache isn't warm (rare — the import flow just read it). Import scopes the
  // batch by id anyway, so a light select is enough to hand bulkComplete the incomplete rows.
  const { data } = await supabase.from('books').select('*, book_authors(position, role, authors(id, name))')
  const { toBook } = await import('./mappers')
  return ((data as Parameters<typeof toBook>[0][]) ?? []).map(toBook)
}
