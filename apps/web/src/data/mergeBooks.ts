import { useMutation, useQueryClient } from '@tanstack/react-query'
import { mergeBooks as mergeBooksCore, type Book } from '@reverie/core'
import { supabase } from '../lib/supabase'
import { toBookRow, toReadEntry } from './mappers'
import type { ReadRow } from './types'
import { booksKey } from './books'
import { listsKey } from './lists'

/**
 * Merge `loser` into `primary`. Uses @reverie/core's mergeBooks for the field-level union
 * (reads dedup, tropes, best cover/rating/spice/series info), then persists the result:
 * update the primary row, carry over the loser's new reads and list memberships, and delete
 * the loser (cascade clears its reads + list_items).
 *
 * This is a client-side orchestration (several round-trips, not one transaction). Per
 * docs/DATA_MODEL.md it should become a server RPC / Edge Function — tracked for Step 8.
 */
export function usePerformMerge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ primary, loser }: { primary: Book; loser: Book }): Promise<void> => {
      const { data: auth } = await supabase.auth.getUser()
      const ownerId = auth.user?.id
      if (!ownerId) throw new Error('Not signed in')

      // Pull both books' reads + list memberships.
      const [primaryReads, loserReads, primaryItems, loserItems] = await Promise.all([
        supabase.from('reads').select('*').eq('book_id', primary.id),
        supabase.from('reads').select('*').eq('book_id', loser.id),
        supabase.from('list_items').select('list_id').eq('book_id', primary.id),
        supabase.from('list_items').select('list_id').eq('book_id', loser.id),
      ])
      for (const r of [primaryReads, loserReads, primaryItems, loserItems]) {
        if (r.error) throw r.error
      }

      const withReads = (b: Book, rows: ReadRow[]): Book => ({ ...b, reads: rows.map(toReadEntry) })
      const merged = mergeBooksCore(
        {
          books: [
            withReads(primary, primaryReads.data as ReadRow[]),
            withReads(loser, loserReads.data as ReadRow[]),
          ],
          tbrs: [],
          collections: [],
        },
        primary.id,
        [loser.id],
      ).books[0]
      if (!merged) throw new Error('Merge produced no book')

      // 1. Update the primary's merged fields.
      const upd = await supabase.from('books').update(toBookRow(merged)).eq('id', primary.id)
      if (upd.error) throw upd.error

      // 2. Carry over the loser's reads whose dates the primary doesn't already have.
      const primaryDates = new Set(
        (primaryReads.data as ReadRow[]).map((r) => r.read_on).filter(Boolean),
      )
      const newReads = (loserReads.data as ReadRow[])
        .filter((r) => r.read_on && !primaryDates.has(r.read_on))
        .map((r) => ({
          book_id: primary.id,
          owner_id: ownerId,
          read_on: r.read_on,
          format: r.format,
          rating: r.rating,
          notes: r.notes,
        }))
      if (newReads.length) {
        const ins = await supabase.from('reads').insert(newReads)
        if (ins.error) throw ins.error
      }

      // 3. Add the primary to any list the loser was in (and the primary wasn't).
      const primaryListIds = new Set((primaryItems.data as { list_id: string }[]).map((r) => r.list_id))
      const newItems = (loserItems.data as { list_id: string }[])
        .map((r) => r.list_id)
        .filter((id) => !primaryListIds.has(id))
        .map((list_id) => ({ list_id, book_id: primary.id, owner_id: ownerId }))
      if (newItems.length) {
        const ins = await supabase.from('list_items').insert(newItems)
        if (ins.error) throw ins.error
      }

      // 4. Delete the loser (cascade removes its reads + list_items).
      const del = await supabase.from('books').delete().eq('id', loser.id)
      if (del.error) throw del.error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: booksKey })
      void qc.invalidateQueries({ queryKey: listsKey })
    },
  })
}
