import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

const writes: { table: string; kind: 'insert' | 'update' | 'delete' }[] = []
let seriesRows: Record<string, unknown>[] = []
let entryRows: Record<string, unknown>[] = []

const SERIES_ROW = (name: string) => ({
  id: `id-${name}`,
  owner_id: 'owner-1',
  name,
  status: null,
  source: 'manual',
  source_ref: null,
  refreshed_at: null,
})

function chain(table: string, result: () => unknown): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  const filters: { column: string; value: unknown }[] = []
  for (const method of ['select', 'limit', 'order', 'is', 'not', 'single', 'maybeSingle'])
    query[method] = () => query
  query.eq = (column: string, value: unknown) => {
    filters.push({ column, value })
    return query
  }
  query.then = (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => {
    const raw = result() as { data: unknown; error: unknown }
    const name = filters.find((filter) => filter.column === 'name')?.value
    const data =
      table === 'series' && typeof name === 'string' && Array.isArray(raw.data)
        ? (raw.data as Record<string, unknown>[]).filter((row) => row.name === name)
        : raw.data
    return Promise.resolve({ ...raw, data }).then(resolve, reject)
  }
  return query
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () =>
        chain(table, () => ({
          data: table === 'series' ? seriesRows : table === 'series_entries' ? entryRows : [],
          error: null,
        })),
      insert: () => {
        writes.push({ table, kind: 'insert' })
        return chain(table, () => ({ data: [], error: null }))
      },
      update: () => {
        writes.push({ table, kind: 'update' })
        return chain(table, () => ({ data: [], error: null }))
      },
      delete: () => {
        writes.push({ table, kind: 'delete' })
        return chain(table, () => ({ data: [], error: null }))
      },
    }),
  },
}))

const { fetchBookSeriesMemberships, useSeriesDetail } = await import('./series')

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  writes.length = 0
  seriesRows = []
  entryRows = []
})

describe('series detail is a read, never an admission event', () => {
  it('returns null and performs no write when no exact series row exists', async () => {
    const { result } = renderHook(() => useSeriesDetail('The Empyrean'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
    expect(writes).toEqual([])
  })

  it('does not absorb a normalized variant into an existing series', async () => {
    seriesRows = [SERIES_ROW('The Freckled Fate')]
    const { result } = renderHook(() => useSeriesDetail('The Freckled Fate Series'), {
      wrapper: wrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
    expect(writes).toEqual([])
  })

  it('returns only confirmed entries and exposes unknown rows for review', async () => {
    seriesRows = [SERIES_ROW('The Empyrean')]
    entryRows = [
      {
        id: 'confirmed',
        series_id: 'id-The Empyrean',
        position: 1,
        label: null,
        title: 'Fourth Wing',
        author: 'Rebecca Yarros',
        book_id: 'book-1',
        source: 'manual',
        user_edited: true,
        removed_at: null,
        membership_claim: { origin: 'reader' },
      },
      {
        id: 'unknown',
        series_id: 'id-The Empyrean',
        position: 2,
        label: null,
        title: 'Iron Flame',
        author: 'Rebecca Yarros',
        book_id: 'book-2',
        source: 'manual',
        user_edited: false,
        removed_at: null,
        membership_claim: { origin: 'unknown' },
      },
    ]
    const { result } = renderHook(() => useSeriesDetail('The Empyrean'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.entries.map((entry) => entry.id)).toEqual(['confirmed'])
    expect(result.current.data?.unreviewed.map((entry) => entry.id)).toEqual(['unknown'])
    expect(writes).toEqual([])
  })
})

describe('book membership projection', () => {
  it('returns every confirmed membership with the selected primary first', async () => {
    entryRows = [
      {
        id: 'secondary',
        series_id: 'series-b',
        series: { id: 'series-b', name: 'Companion Stories' },
        position: 0.5,
        label: 'prequel',
        title: 'A Shared Book',
        author: 'An Author',
        book_id: 'book-1',
        source: 'manual',
        user_edited: true,
        removed_at: null,
        is_primary: false,
        membership_claim: { origin: 'reader', source: 'series_builder' },
        position_claim: { origin: 'reader', source: 'series_order' },
      },
      {
        id: 'primary',
        series_id: 'series-a',
        series: { id: 'series-a', name: 'Main Saga' },
        position: 2,
        label: null,
        title: 'A Shared Book',
        author: 'An Author',
        book_id: 'book-1',
        source: 'manual',
        user_edited: true,
        removed_at: null,
        is_primary: true,
        membership_claim: { origin: 'reader', source: 'book_edit' },
        position_claim: { origin: 'reader', source: 'book_edit' },
      },
      {
        id: 'unknown',
        series_id: 'series-c',
        series: { id: 'series-c', name: 'Unreviewed Guess' },
        position: 9,
        label: null,
        title: 'A Shared Book',
        author: 'An Author',
        book_id: 'book-1',
        source: 'manual',
        user_edited: false,
        removed_at: null,
        is_primary: false,
        membership_claim: { origin: 'unknown' },
        position_claim: { origin: 'unknown' },
      },
    ]

    const memberships = await fetchBookSeriesMemberships('book-1')
    expect(memberships.map(({ series }) => series.name)).toEqual([
      'Main Saga',
      'Companion Stories',
    ])
    expect(memberships[0]?.entry.isPrimary).toBe(true)
    expect(memberships[1]?.entry.positionClaim?.source).toBe('series_order')
    expect(writes).toEqual([])
  })
})
