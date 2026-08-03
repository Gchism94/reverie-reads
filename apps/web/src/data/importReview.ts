import { useQueryClient } from '@tanstack/react-query'
import { buildReviewModelFromImport, type ImportItemOutcome, type ReviewModel } from '@reverie/core'
import { useBooks } from './books'
import { useBrokenCoverIds } from './brokenCovers'

/** The last import's per-book outcomes (E3), stashed in the query cache by the import action so the
 *  review screen can rebuild the model against the current (post-enrichment) books. */
export interface ImportSession {
  outcomes: ImportItemOutcome[]
}

export const importSessionKey = ['importSession'] as const

/**
 * Build the import-review model from the last import session + the current books. The books are read
 * live (so covers/confidence that enrichment fills in the background flow into the buckets on the next
 * render). Returns null when there's no import to review.
 */
export function useImportReviewModel(): ReviewModel | null {
  const qc = useQueryClient()
  const session = qc.getQueryData<ImportSession>(importSessionKey)
  const { data: books } = useBooks()
  const brokenRefs = useBrokenCoverIds()
  if (!session || !session.outcomes.length) return null
  return buildReviewModelFromImport(session.outcomes, books ?? [], { brokenRefs })
}
