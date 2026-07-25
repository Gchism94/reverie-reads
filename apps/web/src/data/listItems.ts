import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { listsKey } from './lists'

export const bookListsKey = (bookId: string) => ['book-lists', bookId] as const
export const allListItemsKey = ['list-items', 'all'] as const

export interface ListItemRow {
  list_id: string
  book_id: string
  position: number | null
}

/** All list memberships — used to render Shelves and the Home priority shelf. */
export function useAllListItems() {
  return useQuery({
    queryKey: allListItemsKey,
    queryFn: async (): Promise<ListItemRow[]> => {
      const { data, error } = await supabase.from('list_items').select('list_id, book_id, position')
      if (error) throw error
      return data as ListItemRow[]
    },
  })
}

/** The set of list ids that currently contain this book. */
export function useBookListIds(bookId: string) {
  return useQuery({
    queryKey: bookListsKey(bookId),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('list_items')
        .select('list_id')
        .eq('book_id', bookId)
      if (error) throw error
      return (data as { list_id: string }[]).map((r) => r.list_id)
    },
    enabled: !!bookId,
  })
}

/** Add several books to a list at once (used by Match's "add top 3 to Priority TBR"). */
export function useAddBooksToList() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The shelf' },
    mutationFn: async ({ listId, bookIds }: { listId: string; bookIds: string[] }): Promise<void> => {
      const { data: auth } = await supabase.auth.getUser()
      const ownerId = auth.user?.id
      if (!ownerId || !bookIds.length) return
      const { error } = await supabase
        .from('list_items')
        .upsert(
          bookIds.map((book_id) => ({ list_id: listId, book_id, owner_id: ownerId })),
          { onConflict: 'list_id,book_id', ignoreDuplicates: true },
        )
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: allListItemsKey })
      void qc.invalidateQueries({ queryKey: listsKey })
    },
  })
}

/** Remove a specific book from a specific list (used by the Shelves list editor). */
export function useRemoveListItem() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The shelf' },
    mutationFn: async ({ listId, bookId }: { listId: string; bookId: string }): Promise<void> => {
      const { error } = await supabase
        .from('list_items')
        .delete()
        .eq('list_id', listId)
        .eq('book_id', bookId)
      if (error) throw error
    },
    onSuccess: (_data, { bookId }) => {
      void qc.invalidateQueries({ queryKey: allListItemsKey })
      void qc.invalidateQueries({ queryKey: listsKey })
      void qc.invalidateQueries({ queryKey: bookListsKey(bookId) })
    },
  })
}

/** Add or remove a book from a list (optimistic). */
export function useToggleListItem(bookId: string) {
  const qc = useQueryClient()
  const key = bookListsKey(bookId)
  return useMutation({
    meta: { action: 'The shelf' },
    mutationFn: async ({ listId, member }: { listId: string; member: boolean }): Promise<void> => {
      if (member) {
        const { error } = await supabase
          .from('list_items')
          .delete()
          .eq('list_id', listId)
          .eq('book_id', bookId)
        if (error) throw error
      } else {
        const { data: auth } = await supabase.auth.getUser()
        const ownerId = auth.user?.id
        if (!ownerId) throw new Error('Not signed in')
        const { error } = await supabase
          .from('list_items')
          .insert({ list_id: listId, book_id: bookId, owner_id: ownerId })
        if (error) throw error
      }
    },
    onMutate: async ({ listId, member }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<string[]>(key)
      qc.setQueryData<string[]>(key, (old) =>
        member ? (old ?? []).filter((id) => id !== listId) : [...(old ?? []), listId],
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key })
      void qc.invalidateQueries({ queryKey: listsKey })
      void qc.invalidateQueries({ queryKey: allListItemsKey })
    },
  })
}

/** Add one book to a list, appended to the end of the manual order. Pass the list's current
 *  max position (from the items cache); the item lands after it. */
export function useAddListItem() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The shelf' },
    mutationFn: async ({ listId, bookId, afterPosition }: { listId: string; bookId: string; afterPosition: number }): Promise<void> => {
      const { data: auth } = await supabase.auth.getUser()
      const ownerId = auth.user?.id
      if (!ownerId) throw new Error('Not signed in')
      const { error } = await supabase
        .from('list_items')
        .upsert(
          [{ list_id: listId, book_id: bookId, owner_id: ownerId, position: afterPosition + 1000 }],
          { onConflict: 'list_id,book_id', ignoreDuplicates: true },
        )
      if (error) throw error
    },
    onSuccess: (_d, { bookId }) => {
      void qc.invalidateQueries({ queryKey: allListItemsKey })
      void qc.invalidateQueries({ queryKey: listsKey })
      void qc.invalidateQueries({ queryKey: bookListsKey(bookId) })
    },
  })
}
