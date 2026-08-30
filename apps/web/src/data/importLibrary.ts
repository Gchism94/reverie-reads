import {
  countTruncatedIsbns,
  parseCSV,
  parseImport,
  type ImportedRow,
  type ImportItemOutcome,
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
  /** rows that carried a "global order" column, which nothing consumes any more.
   *
   *  Reading orders were dropped (chore/drop-reading-orders) and series position is now the single
   *  ordering mechanism — but the reader still typed that column, so the summary says it went
   *  unused rather than discarding it in silence. */
  ignoredGlobalOrder: number
  /** per-resolved-book signals for the import-review read-model (E3); join with the post-enrichment
   *  books via buildReviewModelFromImport(outcomes, books) */
  outcomes: ImportItemOutcome[]
  /** read-only notice signal: ISBNs that look like they lost a leading digit (a zero destroyed on
   *  data entry, before the file existed). Books still imported; these just may not match. */
  truncatedIsbns: number
  /** honest bulk-empty + placement facts the summary speaks to (Goodreads path; empty otherwise) */
  extras: ImportExtras
  /** every resolved book id (added or merged) — the enrichment kickoff scopes its first pass to these */
  bookIds: string[]
  /** resolved personal books explicitly published to the household catalog */
  householdAdded?: number
  /** personal import committed, but its requested household publication did not */
  householdWarning?: string
}

async function householdImportResult(
  bookIds: string[],
  enabled: boolean,
): Promise<{ householdAdded: number; householdWarning?: string }> {
  try {
    return { householdAdded: await addImportedBooksToHousehold(bookIds, enabled) }
  } catch {
    return {
      householdAdded: 0,
      householdWarning:
        'The personal books were imported, but the household entries could not be added. Reconnect and import again with My library + Household; duplicates will fold safely.',
    }
  }
}

export async function addImportedBooksToHousehold(
  bookIds: string[],
  enabled: boolean,
): Promise<number> {
  if (!enabled || !bookIds.length) return 0
  const { data, error } = await supabase.rpc('add_personal_books_to_household', {
    p_books: [...new Set(bookIds)],
  })
  if (error) throw error
  return data as number
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
  opts: { autoMerge: boolean; addToHousehold?: boolean },
): Promise<ImportExportResult> {
  const { profile, rows } = parseImport(text)
  // Read-only, shared by both importers: count likely-truncated ISBNs off the raw header+values, so
  // the "found" summary can warn without touching any value or the merge.
  const truncatedIsbns = countTruncatedIsbns(parseCSV(text))

  // Generic shape → the Goodreads/StoryGraph path (no connected-universe metadata, but it DOES
  // carry the row extras: Imported TBR, custom shelves, and the bulk-empty facts for the summary).
  if (profile.name === 'generic') {
    const r = await importCsvToBackend(currentBooks, text, { autoMerge: opts.autoMerge })
    const householdResult = await householdImportResult(
      r.bookIds,
      opts.addToHousehold ?? false,
    )
    return {
      profile: profile.name,
      added: r.added,
      merged: r.merged,
      review: r.review,
      ingested: [],
      ignoredGlobalOrder: 0,
      outcomes: r.outcomes,
      truncatedIsbns,
      extras: r.extras,
      bookIds: r.bookIds,
      ...householdResult,
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

  // The "global order" column is still parsed, but nothing acts on it: reading orders are gone and
  // series position is the one ordering mechanism. Count what the reader supplied so the summary can
  // say so — a column that silently vanishes is worse than one we admit we ignored.
  const ignoredGlobalOrder = ingested.filter(({ row }) => row.globalOrder != null).length
  const bookIds = ingested.map((i) => i.bookId)
  const householdResult = await householdImportResult(
    bookIds,
    opts.addToHousehold ?? false,
  )

  return {
    profile: profile.name,
    added,
    merged,
    review,
    ingested,
    ignoredGlobalOrder,
    outcomes,
    truncatedIsbns,
    extras: EMPTY_EXTRAS,
    bookIds,
    ...householdResult,
  }
}
