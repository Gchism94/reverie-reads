import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Book } from '@reverie/core'
import { supabase } from '../lib/supabase'
import { toBook, toBookRow } from './mappers'
import type { BookRow } from './types'

export const booksKey = ['books'] as const

/** All of the signed-in user's books (RLS scopes this to them). */
export function useBooks() {
  return useQuery({
    queryKey: booksKey,
    queryFn: async (): Promise<Book[]> => {
      const { data, error } = await supabase
        .from('books')
        .select('*, book_authors(position, role, authors(id, name)), book_tropes(emphasis, tropes(id, name)), book_moods(moods(id, name))')
        .order('added_at', { ascending: true })
      if (error) throw error
      return (data as BookRow[]).map(toBook)
    },
  })
}

export function useAddBook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Partial<Book> & { title: string }): Promise<Book> => {
      const { data: auth } = await supabase.auth.getUser()
      const ownerId = auth.user?.id
      if (!ownerId) throw new Error('Not signed in')
      const row = { ...toBookRow(input), owner_id: ownerId, title: input.title }
      const { data, error } = await supabase.from('books').insert(row).select().single()
      if (error) throw error
      return toBook(data as BookRow)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: booksKey }),
  })
}

/** Optimistic update: patch the cache immediately, roll back on error, reconcile on settle. */
export function useUpdateBook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Book> }): Promise<Book> => {
      const { data, error } = await supabase
        .from('books')
        .update(toBookRow(patch))
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return toBook(data as BookRow)
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: booksKey })
      const previous = qc.getQueryData<Book[]>(booksKey)
      qc.setQueryData<Book[]>(booksKey, (old) =>
        old?.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(booksKey, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: booksKey }),
  })
}

export function useDeleteBook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('books').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: booksKey })
      const previous = qc.getQueryData<Book[]>(booksKey)
      qc.setQueryData<Book[]>(booksKey, (old) => old?.filter((b) => b.id !== id))
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(booksKey, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: booksKey }),
  })
}
