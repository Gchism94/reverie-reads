import { useMutation, useQueryClient } from '@tanstack/react-query'
import { mergeBooks as mergeBooksCore, type Book } from '@reverie/core'
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
    mutationFn: async ({ primary, loser }: { primary: Book; loser: Book }): Promise<void> => {
      const merged = mergeBooksCore(
        { books: [primary, loser], tbrs: [], collections: [] },
        primary.id,
        [loser.id],
      ).books[0]
      if (!merged) throw new Error('Merge produced no book')
      const { error } = await supabase.rpc('merge_books', {
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
