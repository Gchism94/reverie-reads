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

export function useUpdateList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      name,
      isPriority,
    }: {
      id: string
      name?: string
      isPriority?: boolean
    }): Promise<void> => {
      // Only one TBR can be priority — clear the others first.
      if (isPriority === true) {
        const { data: auth } = await supabase.auth.getUser()
        const uid = auth.user?.id
        if (uid) await supabase.from('lists').update({ is_priority: false }).eq('owner_id', uid)
      }
      const row: Record<string, unknown> = {}
      if (name !== undefined) row.name = name
      if (isPriority !== undefined) row.is_priority = isPriority
      const { error } = await supabase.from('lists').update(row).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: listsKey }),
  })
}

export function useDeleteList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('lists').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: listsKey })
      void qc.invalidateQueries({ queryKey: ['list-items', 'all'] })
    },
  })
}

/** Persist a new order by writing each book's position within the list. */
export function useReorderList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      listId,
      orderedBookIds,
    }: {
      listId: string
      orderedBookIds: string[]
    }): Promise<void> => {
      await Promise.all(
        orderedBookIds.map((bookId, i) =>
          supabase.from('list_items').update({ position: i }).eq('list_id', listId).eq('book_id', bookId),
        ),
      )
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['list-items', 'all'] }),
  })
}
