import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { listsKey } from './lists'

export const bookListsKey = (bookId: string) => ['book-lists', bookId] as const

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

/** Add or remove a book from a list (optimistic). */
export function useToggleListItem(bookId: string) {
  const qc = useQueryClient()
  const key = bookListsKey(bookId)
  return useMutation({
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
    },
  })
}
