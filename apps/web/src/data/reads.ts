import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReadEntry } from '@reverie/core'
import { supabase } from '../lib/supabase'
import { toReadEntry } from './mappers'
import type { ReadRow } from './types'

export const readsKey = (bookId: string) => ['reads', bookId] as const

/** The reread log for one book. */
export function useReads(bookId: string) {
  return useQuery({
    queryKey: readsKey(bookId),
    queryFn: async (): Promise<ReadEntry[]> => {
      const { data, error } = await supabase
        .from('reads')
        .select('*')
        .eq('book_id', bookId)
        .order('read_on', { ascending: true })
      if (error) throw error
      return (data as ReadRow[]).map(toReadEntry)
    },
    enabled: !!bookId,
  })
}

/** Optimistically append a reread-log entry for a book. */
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
      const previous = qc.getQueryData<ReadEntry[]>(key)
      qc.setQueryData<ReadEntry[]>(key, (old) => [...(old ?? []), entry])
      return { previous }
    },
    onError: (_err, _entry, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}
