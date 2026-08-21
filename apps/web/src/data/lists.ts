import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { ListRow } from './types'

export interface UiList {
  id: string
  name: string
  kind: 'tbr' | 'collection'
  priority: boolean
  sortOrder: number | null
  description: string
}

/** Spaced-numeric step for manual ordering (shelves + books). Renumber-on-write keeps it simple. */
export const ORDER_STEP = 1000

/**
 * The next append position, read from the database — THE one implementation for every write path
 * that creates a list (createList, the CSV import's ensureList). Extracted after the lists
 * sort_order incident: three insert sites existed, one set sort_order and two forgot, and the two
 * that forgot produced NULLs that a restore then ordered by Postgres scan order. A policy that
 * exists once cannot be forgotten twice. Computed in JS over a plain select rather than
 * order+limit so it behaves identically under the importExport test harness's mock client.
 */
export async function nextListSortOrderFor(ownerId: string): Promise<number> {
  const { data } = await supabase.from('lists').select('sort_order').eq('owner_id', ownerId)
  const rows = (data ?? []) as { sort_order: number | null }[]
  return Math.max(0, ...rows.map((r) => r.sort_order ?? 0)) + ORDER_STEP
}

export const listsKey = ['lists'] as const

const toUiList = (row: ListRow): UiList => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  priority: row.is_priority,
  sortOrder: row.sort_order,
  description: row.description ?? '',
})

/** The signed-in user's TBRs and collections. */
export function useLists() {
  return useQuery({
    queryKey: listsKey,
    queryFn: async (): Promise<UiList[]> => {
      const { data, error } = await supabase
        .from('lists')
        .select('*')
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data as ListRow[]).map(toUiList)
    },
  })
}

export function useCreateList() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The shelf' },
    mutationFn: async (input: {
      name: string
      kind: 'tbr' | 'collection'
      isPriority?: boolean
    }): Promise<UiList> => {
      const { data: auth } = await supabase.auth.getUser()
      const ownerId = auth.user?.id
      if (!ownerId) throw new Error('Not signed in')
      // New shelves append to the end of the manual order.
      const sortOrder = await nextListSortOrderFor(ownerId)
      const { data, error } = await supabase
        .from('lists')
        .insert({
          owner_id: ownerId,
          name: input.name,
          kind: input.kind,
          is_priority: input.isPriority ?? false,
          sort_order: sortOrder,
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
    meta: { action: 'The shelf' },
    mutationFn: async ({
      id,
      name,
      isPriority,
      description,
    }: {
      id: string
      name?: string
      isPriority?: boolean
      description?: string
    }): Promise<void> => {
      // Any number of shelves/TBRs can be priority — the flag is the cap (shelf-system task);
      // the old one-priority-TBR rule is retired.
      const row: Record<string, unknown> = {}
      if (name !== undefined) row.name = name
      if (isPriority !== undefined) row.is_priority = isPriority
      if (description !== undefined) row.description = description || null
      const { error } = await supabase.from('lists').update(row).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: listsKey }),
  })
}

export function useDeleteList() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The shelf' },
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
    meta: { action: 'The shelf' },
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

/** Persist a new SHELF order (renumber-on-write, spaced by ORDER_STEP). */
export function useReorderLists() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The shelf' },
    mutationFn: async (orderedListIds: string[]): Promise<void> => {
      await Promise.all(
        orderedListIds.map((id, i) =>
          supabase.from('lists').update({ sort_order: (i + 1) * ORDER_STEP }).eq('id', id),
        ),
      )
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: listsKey }),
  })
}
