import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReadEntry } from '@reverie/core'
import { supabase } from '../lib/supabase'
import { toReadRecord, type ReadRecord } from './mappers'
import type { ReadRow } from './types'

export const readsKey = (bookId: string) => ['reads', bookId] as const

/** The reread log for one book (newest first). */
export function useReads(bookId: string) {
  return useQuery({
    queryKey: readsKey(bookId),
    queryFn: async (): Promise<ReadRecord[]> => {
      const { data, error } = await supabase
        .from('reads')
        .select('*')
        .eq('book_id', bookId)
        .order('read_on', { ascending: false })
      if (error) throw error
      return (data as ReadRow[]).map(toReadRecord)
    },
    enabled: !!bookId,
  })
}

/** Optimistically append a reread-log entry. */
export function useAddRead(bookId: string) {
  const qc = useQueryClient()
  const key = readsKey(bookId)
  return useMutation({
    mutationFn: async (entry: ReadEntry): Promise<void> => {
      const { data: auth } = await supabase.auth.getUser()
      const ownerId = auth.user?.id
      if (!ownerId) throw new Error('Not signed in')
      const { error } = await supabase.from('reads').insert({
        book_id: bookId,
        owner_id: ownerId,
        read_on: entry.date || null,
        format: entry.format || null,
        rating: entry.rating || null,
        notes: entry.notes || null,
      })
      if (error) throw error
    },
    onMutate: async (entry) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<ReadRecord[]>(key)
      qc.setQueryData<ReadRecord[]>(key, (old) => [{ id: `temp-${entry.date}`, ...entry }, ...(old ?? [])])
      return { previous }
    },
    onError: (_err, _entry, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

/** Optimistically remove a reread-log entry by id. */
export function useDeleteRead(bookId: string) {
  const qc = useQueryClient()
  const key = readsKey(bookId)
  return useMutation({
    mutationFn: async (readId: string): Promise<void> => {
      const { error } = await supabase.from('reads').delete().eq('id', readId)
      if (error) throw error
    },
    onMutate: async (readId) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<ReadRecord[]>(key)
      qc.setQueryData<ReadRecord[]>(key, (old) => old?.filter((r) => r.id !== readId))
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}
