import { parseImport, type ImportedRow } from '@reverie/core'
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
    return { profile: profile.name, added: r.added, merged: r.merged, review: r.review, ingested: [] }
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

  return { profile: profile.name, added, merged, review, ingested }
}
