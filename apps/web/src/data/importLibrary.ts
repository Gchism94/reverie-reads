import {
  countTruncatedIsbns,
  detectUniverses,
  parseCSV,
  parseImport,
  universeInputFromRow,
  type ImportedRow,
  type ImportItemOutcome,
  type UniverseOrder,
} from '@reverie/core'
import { supabase } from '../lib/supabase'
import { applyIncoming, type ReviewCandidate } from './intake'
import { loadVerdicts } from './duplicates'
import { importCsvToBackend, type ImportExtras } from './importExport'
import type { Book } from '@reverie/core'

/** Zero-value extras for the non-Goodreads (profile-mapper) path, which handles its own placement. */
const EMPTY_EXTRAS: ImportExtras = {
  tbrPlaced: 0,
  shelvesCreated: [],
  shelved: 0,
  noCover: 0,
  noIsbn: 0,
  unplacedNotes: 0,
  tropeLikeShelves: [],
}

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
  /** per-resolved-book signals for the import-review read-model (E3); join with the post-enrichment
   *  books via buildReviewModelFromImport(outcomes, books, { readingOrdersBuilt: readingOrders }) */
  outcomes: ImportItemOutcome[]
  /** read-only notice signal: ISBNs that look like they lost a leading digit (a zero destroyed on
   *  data entry, before the file existed). Books still imported; these just may not match. */
  truncatedIsbns: number
  /** honest bulk-empty + placement facts the summary speaks to (Goodreads path; empty otherwise) */
  extras: ImportExtras
  /** every resolved book id (added or merged) — the enrichment kickoff scopes its first pass to these */
  bookIds: string[]
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
  // Read-only, shared by both importers: count likely-truncated ISBNs off the raw header+values, so
  // the "found" summary can warn without touching any value or the merge.
  const truncatedIsbns = countTruncatedIsbns(parseCSV(text))

  // Generic shape → the Goodreads/StoryGraph path (no connected-universe metadata, but it DOES
  // carry the row extras: Imported TBR, custom shelves, and the bulk-empty facts for the summary).
  if (profile.name === 'generic') {
    const r = await importCsvToBackend(currentBooks, text, { autoMerge: opts.autoMerge })
    return {
      profile: profile.name,
      added: r.added,
      merged: r.merged,
      review: r.review,
      ingested: [],
      readingOrders: 0,
      outcomes: r.outcomes,
      truncatedIsbns,
      extras: r.extras,
      bookIds: r.bookIds,
    }
  }

  const ownerId = await currentUserId()
  const verdicts = await loadVerdicts()
  // Mutable snapshot so repeated rows in one import dedupe against earlier ones (+ existing library).
  const library = currentBooks.map((b) => ({ ...b, reads: [...b.reads] }))

  let added = 0
  let merged = 0
  const review: ReviewCandidate[] = []
  const ingested: IngestedRow[] = []
  const outcomes: ImportItemOutcome[] = []

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
    // Capture the per-book review signals for the books that materialized (added or deduped).
    if (res.bookId && (res.outcome === 'added' || res.outcome === 'merged')) {
      outcomes.push({
        bookId: res.bookId,
        disposition: res.outcome,
        duplicateFlagged: row.duplicate,
        unmappedGenre: row.unmappedGenre,
      })
    }
  }

  // I3: connected-series universes (global order) → reading orders, overlaid on the ingested books.
  const universes = detectUniverses(ingested.map(({ row, bookId }) => universeInputFromRow(row, bookId)))
  const readingOrders = await persistUniverseOrders(universes, ownerId)

  return {
    profile: profile.name,
    added,
    merged,
    review,
    ingested,
    readingOrders,
    outcomes,
    truncatedIsbns,
    extras: EMPTY_EXTRAS,
    bookIds: ingested.map((i) => i.bookId),
  }
}
