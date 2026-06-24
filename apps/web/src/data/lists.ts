import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { ListRow } from './types'

export interface UiList {
  id: string
  name: string
  kind: 'tbr' | 'collection'
  priority: boolean
}

export const listsKey = ['lists'] as const

const toUiList = (row: ListRow): UiList => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  priority: row.is_priority,
})

/** The signed-in user's TBRs and collections. */
export function useLists() {
  return useQuery({
    queryKey: listsKey,
    queryFn: async (): Promise<UiList[]> => {
      const { data, error } = await supabase
        .from('lists')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data as ListRow[]).map(toUiList)
    },
  })
}

export function useCreateList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      kind: 'tbr' | 'collection'
      isPriority?: boolean
    }): Promise<UiList> => {
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
      return toUiList(data as ListRow)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: listsKey }),
  })
}
