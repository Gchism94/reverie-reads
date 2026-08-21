import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book } from '@reverie/core'

// WHAT A MEASUREMENT RUN MUST REACH.
//
// The first traced run in production selected ten books correctly and learned nothing: every one
// was answered from the enrich function's GLOBAL enrichment_cache, so no source was queried and the
// expensive path the instrument was built to measure was never entered.
//
// Two independent clocks cause that, and only one of them is the client's:
//   · books.enriched_at        per user, per book   → shouldCheck, here in bulkComplete
//   · enrichment_cache.fetched_at   GLOBAL, by ISBN or title+author → isFresh, in the Edge Function
// A book can be due by the first and fresh by the second. So the fix is BOTH: prefer never-checked
// books, AND bypass the global cache — the second is what actually guarantees a source call.

const enrichCalls: { title?: string; refresh?: boolean; trace?: boolean }[] = []
let stamps: { id: string; enriched_at: string | null }[] = []

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({
      select: () => Promise.resolve({ data: stamps, error: null }),
      insert: () => Promise.resolve({ error: null }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}))
vi.mock('../lib/enrich', () => ({
  enrichBookOutcome: async (i: { title?: string; refresh?: boolean; trace?: boolean }) => {
    enrichCalls.push(i)
    return { status: 'empty' }
  },
}))
vi.mock('../lib/covers', () => ({ ingestCover: async () => ({ status: 'error', code: 'x' }) }))

const { bulkComplete } = await import('./enrichLibrary')

const makeBook = (over: Partial<Book>): Book => ({
  id: 'b1', title: 'A Probe', first: 'Nell', last: 'Marrow', contributors: [],
  series: '', position: '', seriesCount: null, status: 'standalone',
  genre: 'fantasy', subgenre: '', subgenres: [], genres: [], tags: [], tropes: [], moods: [],
  intensity: null, cover: '', pages: null, isbn: '', fave: false,
  darkness: null,
  ownership: 'owned', borrowed: false, wishlist: false,
  owned: { physical: false, ebook: false, audiobook: false },
  format: '', rating: 0, readStatus: 'unset', source: '',
  pub: { y: null, m: null, d: null }, reads: [], plan: { y: null, m: null, d: null },
  progress: 0, addedTs: 0,
  ...over,
})

/** Old enough that shouldCheck lets it through — so ordering, not eligibility, is what is tested. */
const LONG_AGO = new Date(Date.now() - 400 * 86_400_000).toISOString()

beforeEach(() => {
  enrichCalls.length = 0
  stamps = []
})

describe('unvisitedFirst: a capped run spends its budget on never-checked books', () => {
  it('takes the never-checked books first even when they are last in the library array', async () => {
    // Checked books come FIRST in array order, so an unordered run would burn all 2 slots on them.
    const books = [
      makeBook({ id: 'seen-1', title: 'Seen One', cover: '' }),
      makeBook({ id: 'seen-2', title: 'Seen Two', cover: '' }),
      makeBook({ id: 'fresh-1', title: 'Fresh One', cover: '' }),
      makeBook({ id: 'fresh-2', title: 'Fresh Two', cover: '' }),
    ]
    stamps = [
      { id: 'seen-1', enriched_at: LONG_AGO },
      { id: 'seen-2', enriched_at: LONG_AGO },
      { id: 'fresh-1', enriched_at: null },
      { id: 'fresh-2', enriched_at: null },
    ]

    await bulkComplete(books, () => {}, () => false, { limit: 2, unvisitedFirst: true })

    expect(enrichCalls.map((c) => c.title)).toEqual(['Fresh One', 'Fresh Two'])
  })

  // THE MUTATION TARGET for the partition. Without it the same run takes the array's own order,
  // which is what the first production trace did.
  it('without the flag it takes array order, checked books included', async () => {
    const books = [
      makeBook({ id: 'seen-1', title: 'Seen One', cover: '' }),
      makeBook({ id: 'fresh-1', title: 'Fresh One', cover: '' }),
    ]
    stamps = [
      { id: 'seen-1', enriched_at: LONG_AGO },
      { id: 'fresh-1', enriched_at: null },
    ]

    await bulkComplete(books, () => {}, () => false, { limit: 1 })
    expect(enrichCalls.map((c) => c.title)).toEqual(['Seen One'])
  })

  it('keeps relative order inside each group, so the sample is not otherwise reshuffled', async () => {
    const books = [
      makeBook({ id: 'a', title: 'A', cover: '' }),
      makeBook({ id: 'b', title: 'B', cover: '' }),
      makeBook({ id: 'c', title: 'C', cover: '' }),
    ]
    stamps = [
      { id: 'a', enriched_at: LONG_AGO },
      { id: 'b', enriched_at: null },
      { id: 'c', enriched_at: null },
    ]

    await bulkComplete(books, () => {}, () => false, { unvisitedFirst: true })
    expect(enrichCalls.map((c) => c.title)).toEqual(['B', 'C', 'A'])
  })

  it('a book with no stamp row at all counts as never checked, not as checked', async () => {
    // The select returns rows for known books; an id missing from it must not sort as "seen".
    const books = [
      makeBook({ id: 'seen', title: 'Seen', cover: '' }),
      makeBook({ id: 'absent', title: 'Absent', cover: '' }),
    ]
    stamps = [{ id: 'seen', enriched_at: LONG_AGO }]

    await bulkComplete(books, () => {}, () => false, { limit: 1, unvisitedFirst: true })
    expect(enrichCalls.map((c) => c.title)).toEqual(['Absent'])
  })
})

describe('refresh: the global cache is bypassed, which is what actually reaches a source', () => {
  it('passes refresh through to the function when asked', async () => {
    stamps = [{ id: 'b1', enriched_at: null }]
    await bulkComplete([makeBook({ cover: '' })], () => {}, () => false, { refresh: true })
    expect(enrichCalls[0]!.refresh).toBe(true)
  })

  // A NORMAL SWEEP MUST NOT SET IT. refresh re-queries every source for every book; turning it on
  // for the ordinary sweep would multiply the load on Open Library and Google by the cache hit
  // rate, which is the opposite of what the pacing work was for.
  it('never sets refresh on an ordinary sweep', async () => {
    stamps = [{ id: 'b1', enriched_at: null }]
    await bulkComplete([makeBook({ cover: '' })], () => {}, () => false)
    expect(enrichCalls[0]!.refresh).toBeUndefined()

    enrichCalls.length = 0
    await bulkComplete([makeBook({ cover: '' })], () => {}, () => false, { trace: true })
    expect(enrichCalls[0]!.refresh, 'tracing alone must not imply refreshing').toBeUndefined()
  })
})
