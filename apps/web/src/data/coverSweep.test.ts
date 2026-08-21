import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book } from '@reverie/core'

// bulkComplete's cover behaviour: eager ingest, never-overwrite, and what a miss records.
//
// Eager batch ingest adapted from work shared by Annabelle
// (https://github.com/Annabelle0726/somnia-library) — see docs/reference/DATA_SOURCES.md. The lazy path
// (useCoverBackfill) only moves a hotlink into Storage when a reader opens that book, so a library
// filled in bulk keeps hotlinks indefinitely — and a bulk-filled library is exactly the one nobody
// browses one book at a time.

const updates: { id: string; patch: Record<string, unknown> }[] = []
let enrichResult: unknown = { status: 'empty' }
const ingestSpy = vi.fn()

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
      update: (patch: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => {
          updates.push({ id, patch })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))
vi.mock('../lib/enrich', () => ({ enrichBookOutcome: async () => enrichResult }))
vi.mock('../lib/covers', () => ({ ingestCover: (i: unknown) => ingestSpy(i) }))

const { bulkComplete } = await import('./enrichLibrary')

const OL_HOTLINK = 'https://covers.openlibrary.org/b/id/42-M.jpg'
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

/** A complete Book, since bulkComplete runs the real mergeImport over it. */
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

const run = (books: Book[]) => bulkComplete(books, () => {}, () => false)

describe('eager ingest', () => {
  it('ingests a freshly-filled Open Library hotlink and stores the OWNED url, not the hotlink', async () => {
    // The provenance block is what a real Open Library cover response carries. It used to be absent
    // here and the test still passed, because the source label was hardcoded 'openlibrary' — the
    // fixture could not tell a correct label from a lucky one. See coverProvenance.test.ts.
    enrichResult = {
      status: 'ok',
      data: {
        cover: OL_HOTLINK,
        confidence: 'high',
        provenance: { cover: { source: 'openlibrary', at: '2026-08-02T00:00:00Z' } },
      },
    }
    okIngest()
    await run([makeBook({ id: 'b1', title: 'A Book', cover: '' })])

    expect(ingestSpy).toHaveBeenCalledTimes(1)
    expect(ingestSpy.mock.calls[0]![0]).toMatchObject({ bookId: 'b1', source: 'openlibrary', url: OL_HOTLINK })

    const patch = updates.at(-1)!.patch
    expect(patch.cover_url, 'the stored row must carry OUR url, not openlibrary.org').toBe(STORED)
    expect(patch.cover_source).toBe('openlibrary')
  })

  it('does NOT ingest a Google cover — its terms allow hotlinking only', async () => {
    const google = 'https://books.google.com/books/content?id=x&zoom=1'
    enrichResult = { status: 'ok', data: { cover: google, confidence: 'high' } }
    await run([makeBook({ id: 'b1', title: 'A Book', cover: '' })])

    expect(ingestSpy, 'a Google URL must never reach the ingest pipeline').not.toHaveBeenCalled()
    expect(updates.at(-1)!.patch.cover_url).toBe(google) // still filled, still a hotlink
  })

  it('keeps the hotlink when ingest fails — a Storage hiccup must not lose a found cover', async () => {
    enrichResult = { status: 'ok', data: { cover: OL_HOTLINK, confidence: 'high' } }
    ingestSpy.mockResolvedValue({ status: 'error', code: 'storage_failed' })
    await run([makeBook({ id: 'b1', title: 'A Book', cover: '' })])

    expect(updates.at(-1)!.patch.cover_url).toBe(OL_HOTLINK)
  })
})

describe('a miss records the attempt without writing a cover', () => {
  it('stamps enriched_at and writes no cover when the sources have nothing', async () => {
    enrichResult = { status: 'empty' }
    await run([makeBook({ id: 'b1', title: 'A Book', cover: '' })])

    const patch = updates.at(-1)!.patch
    expect(patch.enriched_at, 'the attempt must be recorded or every rerun retries forever').toBeTruthy()
    expect('cover_url' in patch).toBe(false)
    expect(ingestSpy).not.toHaveBeenCalled()
  })

  it('does NOT stamp when rate-limited — the book keeps its old window and retries next run', async () => {
    enrichResult = { status: 'rate_limited' }
    await run([makeBook({ id: 'b1', title: 'A Book', cover: '' })])
    expect(updates).toHaveLength(0)
  })
})

describe('never overwrite an existing cover', () => {
  // TWO GUARDS IN SERIES, AND EACH MASKS THE OTHER — established by mutation, after two wrong
  // guesses about which one was load-bearing:
  //   · enrichmentCoverFill (covers.ts) runs FIRST, inside toIncoming, and blanks the offer when the
  //     book already has a cover or the reader chose one.
  //   · mergeImport's fill('cover') (match.ts) fills only into an empty field.
  // Remove EITHER alone and "already has a cover" still holds — the survivor catches it. Remove BOTH
  // and all three assertions below go red. The single point of failure is the CLEARED-cover case at
  // the bottom: `cover` is empty there, so mergeImport would fill it and only enrichmentCoverFill
  // says no. That one fails on its own the moment enrichmentCoverFill's guard is deleted.
  it('a book that already has a cover is never re-covered, and is never ingested again', async () => {
    enrichResult = { status: 'ok', data: { cover: OL_HOTLINK, confidence: 'high' } }
    okIngest()
    await run([makeBook({ id: 'b1', title: 'A Book', cover: STORED, isbn: '', pub: { y: null, m: null, d: null } })])

    const patch = updates.at(-1)?.patch ?? {}
    expect(patch.cover_url, 'an existing cover must survive the sweep untouched').toBeUndefined()
    expect(ingestSpy, 'and must not be re-ingested, doubling the storage object').not.toHaveBeenCalled()
  })

  it('a user-chosen cover is never replaced', async () => {
    enrichResult = { status: 'ok', data: { cover: OL_HOTLINK, confidence: 'high' } }
    okIngest()
    await run([
      makeBook({ id: 'b1', title: 'A Book', cover: STORED, coverUserChosen: true, isbn: '' }),
    ])
    expect(updates.at(-1)?.patch.cover_url).toBeUndefined()
    expect(ingestSpy).not.toHaveBeenCalled()
  })

  // ENRICHMENT-COVER-FILL'S OWN MUTATION TARGET. `cover` is EMPTY here, so mergeImport would fill it
  // — only `coverUserChosen` stops the sweep re-offering art for a book whose cover the reader threw
  // away on purpose. Delete enrichmentCoverFill's guard and this is the assertion that goes red.
  it('a reader who CLEARED their cover is not handed a new one', async () => {
    enrichResult = { status: 'ok', data: { cover: OL_HOTLINK, confidence: 'high' } }
    okIngest()
    await run([makeBook({ id: 'b1', title: 'A Book', cover: '', coverUserChosen: true })])

    const patch = updates.at(-1)!.patch
    expect(patch.cover_url, 'a deliberately cleared cover must stay cleared').toBeUndefined()
    expect(ingestSpy, 'and nothing should be fetched into Storage for it').not.toHaveBeenCalled()
    expect(patch.enriched_at, 'but the attempt is still recorded').toBeTruthy()
  })
})
