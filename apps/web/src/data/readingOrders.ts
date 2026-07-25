import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  appendPosition,
  reorderItems,
  type ReadingOrder,
  type ReadingOrderItem,
} from '@reverie/core'
import { supabase } from '../lib/supabase'

export const readingOrdersKey = ['reading_orders'] as const

interface OrderItemRow {
  id: string
  position: number
  book_id: string | null
  series: string | null
  note: string | null
}
interface OrderRow {
  id: string
  name: string
  description: string | null
  reading_order_items: OrderItemRow[]
}

const toItem = (r: OrderItemRow): ReadingOrderItem => ({
  id: r.id,
  kind: r.book_id ? 'book' : 'series',
  bookId: r.book_id ?? undefined,
  series: r.series ?? undefined,
  note: r.note ?? undefined,
  position: r.position,
})

const toOrder = (r: OrderRow): ReadingOrder => ({
  id: r.id,
  name: r.name,
  description: r.description ?? undefined,
  items: (r.reading_order_items ?? []).map(toItem).sort((a, b) => a.position - b.position),
})

/** All of the signed-in user's reading orders with their items (RLS scopes this to them). */
export function useReadingOrders() {
  return useQuery({
    queryKey: readingOrdersKey,
    queryFn: async (): Promise<ReadingOrder[]> => {
      const { data, error } = await supabase
        .from('reading_orders')
        .select('id, name, description, reading_order_items(id, position, book_id, series, note)')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data as OrderRow[]).map(toOrder)
    },
  })
}

async function ownerId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error('Not signed in')
  return id
}

export function useCreateOrder() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The reading order' },
    mutationFn: async ({ name, description }: { name: string; description?: string }): Promise<string> => {
      const owner_id = await ownerId()
      const { data, error } = await supabase
        .from('reading_orders')
        .insert({ owner_id, name, description: description || null })
        .select('id')
        .single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: readingOrdersKey }),
  })
}

export function useUpdateOrder() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The reading order' },
    mutationFn: async ({ id, name, description }: { id: string; name?: string; description?: string }): Promise<void> => {
      const patch: Record<string, string | null> = {}
      if (name !== undefined) patch.name = name
      if (description !== undefined) patch.description = description || null
      const { error } = await supabase.from('reading_orders').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: readingOrdersKey }),
  })
}

export function useDeleteOrder() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The reading order' },
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('reading_orders').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: readingOrdersKey }),
  })
}

/** Append a book or series item to the end of an order. */
export function useAddOrderItem() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The reading order' },
    mutationFn: async ({
      order,
      bookId,
      series,
    }: {
      order: ReadingOrder
      bookId?: string
      series?: string
    }): Promise<void> => {
      const owner_id = await ownerId()
      const position = appendPosition(order.items)
      const { error } = await supabase.from('reading_order_items').insert({
        reading_order_id: order.id,
        owner_id,
        position,
        book_id: bookId ?? null,
        series: series ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: readingOrdersKey }),
  })
}

export function useRemoveOrderItem() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The reading order' },
    mutationFn: async (itemId: string): Promise<void> => {
      const { error } = await supabase.from('reading_order_items').delete().eq('id', itemId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: readingOrdersKey }),
  })
}

export function useSetItemNote() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The reading order' },
    mutationFn: async ({ itemId, note }: { itemId: string; note: string }): Promise<void> => {
      const { error } = await supabase.from('reading_order_items').update({ note: note || null }).eq('id', itemId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: readingOrdersKey }),
  })
}

/**
 * Move an item to a new slot. The pure reorderItems computes new fractional positions (renumbering
 * everything if a midpoint would collide); we persist only the rows whose position actually changed.
 */
export function useReorderItem() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The reading order' },
    mutationFn: async ({ order, itemId, toIndex }: { order: ReadingOrder; itemId: string; toIndex: number }): Promise<void> => {
      const before = new Map(order.items.map((i) => [i.id, i.position]))
      const next = reorderItems(order.items, itemId, toIndex)
      const changed = next.filter((i) => before.get(i.id) !== i.position)
      for (const i of changed) {
        const { error } = await supabase.from('reading_order_items').update({ position: i.position }).eq('id', i.id)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: readingOrdersKey }),
  })
}
