import { detectUniverses, parseImport, universeInputFromRow, type ImportedRow, type UniverseOrder } from '@reverie/core'
import { supabase } from '../lib/supabase'
import { applyIncoming, type ReviewCandidate } from './intake'
import { loadVerdicts } from './duplicates'
import { importCsvToBackend } from './importExport'
import type { Book } from '@reverie/core'

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error('Not signed in')
  return id
}

/** One ingested row: its source metadata + the resulting book id (for the connected-series step). */
export interface IngestedRow {
  row: ImportedRow
  bookId: string
}

export interface ImportExportResult {
  profile: string
  added: number
  merged: number
  review: ReviewCandidate[]
  /** rows that resolved to a book (added or merged) — fuel for I3 reading-order creation */
  ingested: IngestedRow[]
  /** connected-universe reading orders created/refreshed from the import */
  readingOrders: number
}

/**
 * Create (or refresh, idempotently) a reading order per detected universe. Each item references the
 * ingested book at its exact global-order position — an OVERLAY, leaving the book's own series +
 * position untouched. Re-import reuses the same-named order and replaces its items, so it never
 * multiplies. Owner-scoped via RLS (the user writes their own rows).
 */
async function persistUniverseOrders(orders: UniverseOrder[], ownerId: string): Promise<number> {
  let count = 0
  for (const o of orders) {
    const { data: existing } = await supabase
      .from('reading_orders')
      .select('id')
      .eq('owner_id', ownerId)
      .eq('name', o.name)
      .maybeSingle()
    let orderId = (existing as { id: string } | null)?.id
    if (orderId) {
      await supabase.from('reading_order_items').delete().eq('reading_order_id', orderId).eq('owner_id', ownerId)
    } else {
      const { data: created, error } = await supabase
        .from('reading_orders')
        .insert({ owner_id: ownerId, name: o.name, description: 'Imported from a connected-series universe.' })
        .select('id')
        .single()
      if (error) throw error
      orderId = (created as { id: string }).id
    }
    const items = o.items.map((it) => ({
      reading_order_id: orderId,
      owner_id: ownerId,
      position: it.position,
      book_id: it.ref,
      series: null,
      note: null,
    }))
    if (items.length) {
      const { error } = await supabase.from('reading_order_items').insert(items)
      if (error) throw error
    }
    count++
  }
  return count
}

/**
 * Import a real library export (Phase-7 populate path). Detects the column shape; Library/Chism go
 * through the profile mapper + the existing match/merge intake (auto-merge strong, review fuzzy) so
 * re-import is idempotent and the "Duplicate" flag folds in rather than duplicating. A generic
 * Goodreads/StoryGraph CSV falls back to the existing importer. Returns the per-row book ids so the
 * connected-series step (I3) can build reading orders.
 */
export async function importDetectedExport(
  currentBooks: Book[],
  text: string,
  opts: { autoMerge: boolean },
): Promise<ImportExportResult> {
  const { profile, rows } = parseImport(text)

  // Generic shape → the existing Goodreads/StoryGraph path (no connected-universe metadata).
  if (profile.name === 'generic') {
    const r = await importCsvToBackend(currentBooks, text, { autoMerge: opts.autoMerge })
    return { profile: profile.name, added: r.added, merged: r.merged, review: r.review, ingested: [], readingOrders: 0 }
  }

  const ownerId = await currentUserId()
  const verdicts = await loadVerdicts()
  // Mutable snapshot so repeated rows in one import dedupe against earlier ones (+ existing library).
  const library = currentBooks.map((b) => ({ ...b, reads: [...b.reads] }))

  let added = 0
  let merged = 0
  const review: ReviewCandidate[] = []
  const ingested: IngestedRow[] = []

  for (const row of rows) {
    const res = await applyIncoming(row.incoming, library, ownerId, {
      fuzzy: 'review',
      autoMergeStrong: opts.autoMerge,
      verdicts,
    })
    if (res.outcome === 'added') added++
    else if (res.outcome === 'merged') merged++
    if (res.review) review.push(res.review)
    if (res.bookId) ingested.push({ row, bookId: res.bookId })
  }

  // I3: connected-series universes (global order) → reading orders, overlaid on the ingested books.
  const universes = detectUniverses(ingested.map(({ row, bookId }) => universeInputFromRow(row, bookId)))
  const readingOrders = await persistUniverseOrders(universes, ownerId)

  return { profile: profile.name, added, merged, review, ingested, readingOrders }
}
