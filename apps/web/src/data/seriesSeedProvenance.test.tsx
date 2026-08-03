import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// WHO PLACED THIS ROW — the provenance `user_edited` is supposed to record.
//
// `mergeSourceEntries` moves a row only when `!userEdited`, so `user_edited` decides whether
// "Fetch series data" can ever correct a position. Reconciliation seeds an entry for every library
// book naming the series and, from ab9e1fe (#77) until this branch, stamped every one of them
// `user_edited: true` — machine output wearing a reader's signature. The effect was total: opening
// a series page once made that whole series permanently uncorrectable, and the series backfill
// (#130) turned 3 series into 252, so every page opened from here on minted a fresh batch.
//
// THE CORE TEST CANNOT CATCH A REGRESSION HERE. `packages/core` sees a `SeriesEntry` that already
// has its flag; what that flag was set to at INSERT time is decided in this file's subject,
// `useSeriesDetail`, and is invisible from core. So this drives the real hook and reads the row it
// actually sends to Supabase, rather than asserting against a re-stated payload.

interface Captured {
  table: string
  rows: Record<string, unknown>[]
}
interface Patch {
  table: string
  patch: Record<string, unknown>
}

const inserted: Captured[] = []
const patched: Patch[] = []
let libraryBooks: Record<string, unknown>[] = []
let entryRows: Record<string, unknown>[] = []

const SERIES_ROW = {
  id: 'ser-1',
  owner_id: 'owner-1',
  name: 'The Empyrean',
  status: null,
  source: 'manual',
  source_ref: null,
  refreshed_at: null,
}

/** A thenable that answers every builder method with itself — enough for the chains under test. */
function chain(result: () => unknown): Record<string, unknown> {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'limit', 'order', 'is', 'not', 'single', 'maybeSingle'])
    c[m] = () => c
  c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve, reject)
  return c
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'owner-1' } } }) },
    from: (table: string) => ({
      select: () =>
        chain(() => {
          if (table === 'series') return { data: [SERIES_ROW], error: null }
          if (table === 'series_entries') return { data: entryRows, error: null }
          if (table === 'books') return { data: libraryBooks, error: null }
          return { data: [], error: null }
        }),
      insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        const list = Array.isArray(rows) ? rows : [rows]
        inserted.push({ table, rows: list })
        // `.select()` after insert returns the stored rows; ids are all `useSeriesDetail` reads.
        const stored = list.map((r, i) => ({ ...r, id: `new-${i}`, removed_at: null, label: null }))
        const res = { data: stored, error: null }
        return { ...chain(() => res), then: (f: (v: unknown) => unknown) => Promise.resolve(res).then(f) }
      },
      update: (patch: Record<string, unknown>) => {
        patched.push({ table, patch })
        return chain(() => ({ data: [], error: null }))
      },
    }),
    rpc: async () => ({ error: null }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}))

const { useSeriesDetail, useMoveEntry, useAddGhostEntry, useUpdateEntry } = await import('./series')

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

/** The row `useSeriesDetail` sends for a library book joining the series. */
const seededRow = () =>
  inserted.find((c) => c.table === 'series_entries')?.rows[0] as Record<string, unknown> | undefined

beforeEach(() => {
  inserted.length = 0
  patched.length = 0
  entryRows = []
  libraryBooks = [
    {
      id: 'book-1',
      title: 'Fourth Wing',
      author_first: 'Rebecca',
      author_last: 'Yarros',
      position: 1,
      status: null,
    },
  ]
})

describe('reconciliation seeds machine rows, not reader gestures', () => {
  it('writes user_edited: false on a seeded entry', async () => {
    const { result } = renderHook(() => useSeriesDetail('The Empyrean'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // Assert the row was sent at all before asserting about its contents: a `?.` on a row that was
    // never inserted would read `undefined !== true` and pass this by never having run the code.
    expect(seededRow()).toBeDefined()
    expect(seededRow()?.user_edited).toBe(false)
  })

  it('still links the seeded entry to its book — provenance changed, nothing else did', async () => {
    const { result } = renderHook(() => useSeriesDetail('The Empyrean'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(seededRow()?.book_id).toBe('book-1')
    expect(seededRow()?.source).toBe('manual')
    expect(seededRow()?.position).toBe(1)
  })
})

describe('every reader gesture still claims the row', () => {
  it('a drag marks the moved entry user_edited', async () => {
    const { result } = renderHook(() => useMoveEntry('The Empyrean'), { wrapper: wrapper() })
    result.current.mutate({ entryId: 'e1', position: 2 })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const move = patched.find((p) => p.table === 'series_entries')
    expect(move?.patch.user_edited).toBe(true)
  })

  it('a hand-set position marks it user_edited', async () => {
    const { result } = renderHook(() => useUpdateEntry('The Empyrean'), { wrapper: wrapper() })
    result.current.mutate({ entryId: 'e1', position: 4 })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(patched.find((p) => p.table === 'series_entries')?.patch.user_edited).toBe(true)
  })

  it('a manually added ghost slot is user_edited from birth', async () => {
    const { result } = renderHook(() => useAddGhostEntry('The Empyrean'), { wrapper: wrapper() })
    result.current.mutate({ seriesId: 'ser-1', title: 'Onyx Storm', author: 'R Yarros', position: 3 })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const ghost = inserted.find((c) => c.table === 'series_entries')?.rows[0]
    expect(ghost).toBeDefined()
    expect(ghost?.user_edited).toBe(true)
  })
})
