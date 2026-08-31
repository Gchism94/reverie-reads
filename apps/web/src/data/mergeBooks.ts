import { useMutation, useQueryClient } from '@tanstack/react-query'
import { applyBookMergePicks, type Book, type MergeFieldPicks } from '@reverie/core'
import { supabase } from '../lib/supabase'
import { toBookRow } from './mappers'
import { booksKey } from './books'
import { listsKey } from './lists'

/**
 * Merge `loser` into `primary`. @reverie/core computes the field-level union (tags, owned,
 * best cover/rating/intensity/series info); the merge_books RPC then applies it ATOMICALLY in one
 * transaction — carrying the loser's reads + list memberships onto the primary and deleting
 * the loser. A mid-flight failure rolls everything back, so a bulk "merge all" can never orphan
 * a list/club reference or lose reads/reviews/ratings, and is safe to re-run.
 */
export function usePerformMerge() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The merge' },
    mutationFn: async ({
      primary,
      loser,
      picks,
    }: {
      primary: Book
      loser: Book
      /** per-field overrides from MergePreview's picker; absent = the engine's answer, so the
       *  bulk path (SettingsRoute passes none) writes exactly what it always wrote */
      picks?: MergeFieldPicks
    }): Promise<void> => {
      const merged = applyBookMergePicks(primary, loser, picks)
      const { error } = await supabase.rpc('merge_books_authoritative', {
        p_primary: primary.id,
        p_loser: loser.id,
        p_fields: toBookRow(merged),
      })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: booksKey })
      void qc.invalidateQueries({ queryKey: listsKey })
      void qc.invalidateQueries({ queryKey: ['list-items', 'all'] })
      void qc.invalidateQueries({ queryKey: ['reads', 'all'] })
    },
  })
}
