import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// TIER 1 PREVENTION, at the call site — the part packages/core cannot see.
//
// `seriesNameKey` is unit-tested next door against the eleven production sets; what it CANNOT
// prove is that `useSeriesDetail` actually consults it before minting a row, or that a near-match
// hit changes which books get reconciled. Both are decisions made in this file's subject, and both
// are the defect: lazy find-or-create with an exact-name lookup is what minted the ACOTAR row
// minutes before the screenshots that reported it.
//
// The scope claim under test is as important as the prevention: this branch must not merge, rename
// or delete anything. So the assertions below are about (1) whether an INSERT happens and (2) which
// name the book reconciliation keys off — never about moving data between records.

interface Insert {
  table: string
  rows: Record<string, unknown>[]
}
const inserts: Insert[] = []
const bookQueries: string[] = []
let seriesRows: Record<string, unknown>[] = []

const SERIES_ROW = (name: string, id = `id-${name}`) => ({
  id,
  owner_id: 'owner-1',
  name,
  status: null,
  source: 'manual',
  source_ref: null,
  refreshed_at: null,
})

/**
 * A thenable query builder that records the filters it was given AND applies the ones that matter.
 *
 * `.eq('name', …)` on `series` really filters, and that is load-bearing rather than fussiness: an
 * earlier version of this mock ignored it, so the EXACT-name lookup matched any stored row and
 * "does not create a second row" passed without the guard running at all — green for exactly the
 * wrong reason. The two must-still-create cases (initialism, sibling) are what caught it.
 */
function chain(table: string, result: () => unknown): Record<string, unknown> {
  const c: Record<string, unknown> = {}
  const filters: { col: string; val: string }[] = []
  for (const m of ['select', 'limit', 'order', 'is', 'not', 'single', 'maybeSingle'])
    c[m] = () => c
  c.eq = (col: string, val: string) => {
    // The assertion this whole file exists for: which series name the BOOK fetch filters on.
    if (table === 'books' && col === 'series') bookQueries.push(val)
    filters.push({ col, val })
    return c
  }
  c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
    const raw = result() as { data: unknown; error: unknown }
    const nameFilter = filters.find((f) => f.col === 'name')
    const data =
      table === 'series' && nameFilter && Array.isArray(raw.data)
        ? (raw.data as Record<string, unknown>[]).filter((r) => r.name === nameFilter.val)
        : raw.data
    return Promise.resolve({ ...raw, data }).then(resolve, reject)
  }
  return c
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'owner-1' } } }) },
    from: (table: string) => ({
      select: () =>
        chain(table, () => {
          if (table === 'series') return { data: seriesRows, error: null }
          return { data: [], error: null } // series_entries + books: empty, we assert the FILTER
        }),
      insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        const list = Array.isArray(rows) ? rows : [rows]
        inserts.push({ table, rows: list })
        const stored = list.map((r, i) => ({ ...SERIES_ROW(String(r.name)), ...r, id: `new-${i}` }))
        const res = { data: stored[0], error: null }
        return {
          ...chain(table, () => res),
          select: () => ({ single: () => Promise.resolve(res), then: undefined }),
        }
      },
      update: () => chain(table, () => ({ data: [], error: null })),
    }),
  },
}))

const { useSeriesDetail } = await import('./series')

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

const seriesInserts = () => inserts.filter((i) => i.table === 'series')

beforeEach(() => {
  inserts.length = 0
  bookQueries.length = 0
  seriesRows = []
})

describe('lazy creation refuses a normalized-duplicate name', () => {
  it('creates a row when nothing matches — the guard does not block ordinary use', async () => {
    const { result } = renderHook(() => useSeriesDetail('The Empyrean'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(seriesInserts()).toHaveLength(1)
    expect(seriesInserts()[0]!.rows[0]!.name).toBe('The Empyrean')
  })

  it('does NOT create a second row when a normalized match exists', async () => {
    // The live shape: a row exists under one spelling, the reader opens the other.
    seriesRows = [SERIES_ROW('The Freckled Fate')]
    const { result } = renderHook(() => useSeriesDetail('The Freckled Fate Series'), {
      wrapper: wrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(seriesInserts(), 'a duplicate series row was minted').toHaveLength(0)
    // and the reader lands on the surviving record, not a new empty one
    expect(result.current.data?.series.name).toBe('The Freckled Fate')
  })

  it('still creates for an INITIALISM — that pair is Tier 3, not this guard', async () => {
    // ACOTAR is the duplicate the screenshots reported, and this PR deliberately does not fix it:
    // auto-collapsing an initialism is an identity judgment made without asking.
    seriesRows = [SERIES_ROW('A Court of Thorns and Roses')]
    const { result } = renderHook(() => useSeriesDetail('ACOTAR'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(seriesInserts()).toHaveLength(1)
  })

  it('still creates for a SIBLING series sharing a prefix', async () => {
    seriesRows = [SERIES_ROW('Sinners')]
    const { result } = renderHook(() => useSeriesDetail('Sinners and Saints'), {
      wrapper: wrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(seriesInserts(), 'a sibling series was silently absorbed').toHaveLength(1)
  })
})

describe('the guard changes nothing about existing rows (option (a) scope)', () => {
  it('reconciles books under the SURVIVING row name, never the URL name', async () => {
    // Keying off the URL name would seed the variant name's books as entries INTO this record —
    // a membership merge performed silently by a page view. That is PR 2's job, done deliberately,
    // with ghosts/tombstones/positions preserved.
    seriesRows = [SERIES_ROW('The Freckled Fate')]
    const { result } = renderHook(() => useSeriesDetail('The Freckled Fate Series'), {
      wrapper: wrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(bookQueries).toContain('The Freckled Fate')
    expect(bookQueries, 'books were fetched under the variant name — that is a silent merge').not.toContain(
      'The Freckled Fate Series',
    )
  })

  it('reconciles under the URL name in the ordinary case, where they are the same', async () => {
    seriesRows = [SERIES_ROW('The Empyrean')]
    const { result } = renderHook(() => useSeriesDetail('The Empyrean'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(bookQueries).toContain('The Empyrean')
  })

  it('performs no update or delete against series rows on the read path', async () => {
    seriesRows = [SERIES_ROW('The Freckled Fate')]
    const { result } = renderHook(() => useSeriesDetail('The Freckled Fate Series'), {
      wrapper: wrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // nothing was inserted; the surviving row's own name is untouched in the returned detail
    expect(seriesInserts()).toHaveLength(0)
    expect(result.current.data?.series.name).toBe('The Freckled Fate')
  })
})
