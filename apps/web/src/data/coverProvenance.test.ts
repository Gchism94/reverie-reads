import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book } from '@reverie/core'

// WHERE THE SWEEP SAYS A COVER CAME FROM.
//
// bulkComplete used to pass `source: 'openlibrary'` to every ingest, hardcoded, no matter which
// source the merge actually took the cover from. That is not cosmetic: `coverSource` is what
// `resharpenSource` reads to decide whether a stored cover may be re-fetched and from where, so a
// mislabelled row feeds a later sweep a wrong answer about its own data.

const updates: { id: string; patch: Record<string, unknown> }[] = []
let enrichResult: unknown = { status: 'empty' }
const ingestSpy = vi.fn()

vi.mock('../lib/supabase', async () => {
  const { pagedSelect } = await import('./pagedSelect.fixture')
  return {
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({
      select: () => pagedSelect([]),
      insert: () => Promise.resolve({ error: null }),
      update: (patch: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => {
          updates.push({ id, patch })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
  }
})
vi.mock('../lib/enrich', () => ({ enrichBookOutcome: async () => enrichResult }))
vi.mock('../lib/covers', () => ({ ingestCover: (i: unknown) => ingestSpy(i) }))

const { bulkComplete } = await import('./enrichLibrary')

const OL = 'https://covers.openlibrary.org/b/id/42-M.jpg'
const HC = 'https://storage.googleapis.com/hardcover/covers/9781649374042.jpg'
const STORED = 'https://x.supabase.co/storage/v1/object/public/covers/u/1/b/abc.webp'

const okIngest = () =>
  ingestSpy.mockResolvedValue({
    status: 'ok',
    data: { cover: STORED, thumb: `${STORED}_t`, color: '#334455' },
  })

beforeEach(() => {
  updates.length = 0
  ingestSpy.mockReset()
  enrichResult = { status: 'empty' }
})

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

/** An enrich response whose cover provenance names `src`. */
const foundFrom = (src: string, cover: string) => ({
  status: 'ok',
  data: {
    cover,
    confidence: 'high',
    provenance: { cover: { source: src, at: '2026-08-02T00:00:00Z' } },
  },
})

const run = (books: Book[]) => bulkComplete(books, () => {}, () => false)

describe('the ingest is labelled with the source the cover actually came from', () => {
  // THE MUTATION TARGET. Restore the hardcoded `source: 'openlibrary'` and this fails on both
  // assertions — the call and the stored row. It is the only test that can catch that revert:
  // the openlibrary case below passes either way, because there the hardcode happens to be right.
  it('a Hardcover cover is labelled hardcover, not openlibrary', async () => {
    enrichResult = foundFrom('hardcover', HC)
    okIngest()
    await run([makeBook({ id: 'b1', cover: '' })])

    expect(ingestSpy.mock.calls[0]![0]).toMatchObject({ source: 'hardcover', url: HC })
    expect(
      updates.at(-1)!.patch.cover_source,
      'the stored row must not claim an origin the image never had',
    ).toBe('hardcover')
  })

  it('an Open Library cover is still labelled openlibrary', async () => {
    enrichResult = foundFrom('openlibrary', OL)
    okIngest()
    await run([makeBook({ id: 'b1', cover: '' })])

    expect(ingestSpy.mock.calls[0]![0]).toMatchObject({ source: 'openlibrary' })
    expect(updates.at(-1)!.patch.cover_source).toBe('openlibrary')
  })

  // isbndb and manual are real provenance values that are NOT ingestible labels — the covers
  // function would reject them with `bad_source`. 'url' is the honest fallback: a direct image URL
  // whose origin we are not going to misreport.
  it('an origin that is not an ingestible label falls back to url, never to a guess', async () => {
    enrichResult = foundFrom('isbndb', OL)
    okIngest()
    await run([makeBook({ id: 'b1', cover: '' })])

    expect(ingestSpy.mock.calls[0]![0]).toMatchObject({ source: 'url' })
    expect(updates.at(-1)!.patch.cover_source).toBe('url')
  })

  it('a response carrying no provenance at all falls back to url rather than throwing', async () => {
    enrichResult = { status: 'ok', data: { cover: OL, confidence: 'high' } }
    okIngest()
    await run([makeBook({ id: 'b1', cover: '' })])

    expect(ingestSpy.mock.calls[0]![0]).toMatchObject({ source: 'url' })
  })

  it('a failed ingest leaves the hotlink AND writes no cover_source it cannot back up', async () => {
    enrichResult = foundFrom('hardcover', HC)
    ingestSpy.mockResolvedValue({ status: 'error', code: 'storage_failed' })
    await run([makeBook({ id: 'b1', cover: '' })])

    const patch = updates.at(-1)!.patch
    expect(patch.cover_url, 'the hotlink still renders').toBe(HC)
    expect(patch.cover_source, 'nothing was stored, so nothing claims to be stored').toBeUndefined()
  })
})

describe('a traced run does not change what the sweep does', () => {
  // The measurement must not perturb the thing measured. Same inputs, trace on vs off → same writes.
  it('produces the same book update with trace on as with trace off', async () => {
    enrichResult = foundFrom('openlibrary', OL)
    okIngest()
    await run([makeBook({ id: 'b1', cover: '' })])
    const untraced = { ...updates.at(-1)!.patch }

    updates.length = 0
    ingestSpy.mockReset()
    okIngest()
    await bulkComplete([makeBook({ id: 'b1', cover: '' })], () => {}, () => false, {
      trace: true,
      limit: 10,
    })
    const traced = { ...updates.at(-1)!.patch }

    delete (untraced as Record<string, unknown>).enriched_at
    delete (traced as Record<string, unknown>).enriched_at
    expect(traced).toEqual(untraced)
  })

  it('honours a limit below the per-run ceiling', async () => {
    enrichResult = { status: 'empty' }
    const books = Array.from({ length: 5 }, (_, i) => makeBook({ id: `b${i}`, cover: '' }))
    const r = await bulkComplete(books, () => {}, () => false, { limit: 2 })

    expect(r.scanned).toBe(2)
    expect(r.stopReason).toBe('limit')
  })
})
