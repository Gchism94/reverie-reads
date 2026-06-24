import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { List } from '@reverie/core'
import { supabase } from '../lib/supabase'
import { toList } from './mappers'
import type { ListRow } from './types'

export const listsKey = ['lists'] as const

/** The signed-in user's TBRs and collections (membership ids filled in by Step 5/6). */
export function useLists() {
  return useQuery({
    queryKey: listsKey,
    queryFn: async (): Promise<List[]> => {
      const { data, error } = await supabase
        .from('lists')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data as ListRow[]).map(toList)
    },
  })
}

export function useCreateList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; kind: 'tbr' | 'collection'; isPriority?: boolean }) => {
      const { data: auth } = await supabase.auth.getUser()
      const ownerId = auth.user?.id
      if (!ownerId) throw new Error('Not signed in')
      const { data, error } = await supabase
        .from('lists')
        .insert({
          owner_id: ownerId,
          name: input.name,
          kind: input.kind,
          is_priority: input.isPriority ?? false,
        })
        .select()
        .single()
      if (error) throw error
      return toList(data as ListRow)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: listsKey }),
  })
}
