import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * The CSV export's PAGING, asserted against a stand-in that behaves the way PostgREST actually
 * behaves at the boundary: it caps a page at PAGE_CAP rows and it honours `.range()`.
 *
 * This is the defect being guarded, stated plainly so the assertions below can be checked against
 * it: an un-ranged select silently returns only the first 1,000 rows — no error, no warning, just a
 * short answer — and a reader with more books than that gets an export missing the rest. It is the
 * same shape that let the corpus import re-insert 136 books it should have matched. The library is
 * 491 today and roughly 1,366 after that import, so this crosses the cap on its first real use.
 *
 * A test that merely counted the rows coming back from a small fake library would pass with
 * `.range()` deleted, which is why the fake caps.
 */
const PAGE_CAP = 1000

interface Range {
  from: number
  to: number | null
}
let rows: Record<string, unknown>[] = []
let requests: Range[] = []
let ordered: string[] = []

class Query implements PromiseLike<{ data: Record<string, unknown>[]; error: unknown }> {
  private range_: Range = { from: 0, to: null }
  select() {
    return this
  }
  order(col: string) {
    ordered.push(col)
    return this
  }
  range(from: number, to: number) {
    this.range_ = { from, to }
    return this
  }
  then<A, B = never>(
    onOk?: ((v: { data: Record<string, unknown>[]; error: unknown }) => A | PromiseLike<A>) | null,
    onErr?: ((r: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    requests.push(this.range_)
    const { from, to } = this.range_
    // PostgREST serves the requested window, then caps what it will return in one response.
    const end = to === null ? rows.length : to + 1
    const page = rows.slice(from, end).slice(0, PAGE_CAP)
    return Promise.resolve({ data: page, error: null }).then(onOk, onErr)
  }
}

vi.mock('../lib/supabase', () => ({
  supabase: { from: () => new Query() },
}))
vi.mock('./contributors', () => ({ persistContributors: vi.fn(async () => {}) }))

const { fetchLibraryPaged, buildLibraryCsv } = await import('./importExport')

/** Only the columns toBook and the CSV actually read; the rest of a books row is irrelevant here. */
const row = (i: number) => ({
  id: `b-${String(i).padStart(5, '0')}`,
  title: `Book ${String(i).padStart(5, '0')}`,
  author_first: 'Ada',
  author_last: 'Reyes',
  series: null,
  status: 'standalone',
  genre: null,
  genres: [],
  tags: [],
  read_status: 'Unread',
  book_authors: [],
  book_tropes: [],
  book_moods: [],
})

const seed = (n: number) => {
  rows = Array.from({ length: n }, (_, i) => row(i))
}

beforeEach(() => {
  requests = []
  ordered = []
})

describe('the library export pages past the row cap', () => {
  it('returns EVERY book when the library is larger than one page', async () => {
    seed(2500)
    const books = await fetchLibraryPaged()
    expect(books).toHaveLength(2500)
    // Not just the count — the last book must actually be present. A fetch that returned the first
    // page three times would also count 2500 in a less careful fake.
    expect(books.at(-1)?.title).toBe('Book 02499')
    expect(new Set(books.map((b) => b.title)).size).toBe(2500)
  })

  it('asks for successive windows, and stops on the first short page', async () => {
    seed(2500)
    await fetchLibraryPaged()
    expect(requests).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
      { from: 2000, to: 2999 },
    ])
  })

  it('makes a SECOND request when the library is exactly one full page', async () => {
    // The off-by-one that a "stop when the page is empty-ish" loop gets wrong: at exactly 1000 the
    // first page is full, so it cannot be known to be the last one.
    seed(1000)
    expect(await fetchLibraryPaged()).toHaveLength(1000)
    expect(requests).toHaveLength(2)
  })

  it('makes exactly one request for a library smaller than a page', async () => {
    seed(491) // the real library today
    expect(await fetchLibraryPaged()).toHaveLength(491)
    expect(requests).toHaveLength(1)
  })

  it('orders EVERY page of the query, so the pages cannot overlap or skip rows', async () => {
    // `.range()` over an unordered select is not guaranteed to return disjoint pages. Without a
    // stable order the paging above can silently duplicate some books and lose others — a failure
    // that looks like a correct row count. Asserted per page, not once: ordering only the first
    // request would leave every later page unordered.
    seed(2500)
    await fetchLibraryPaged()
    expect(ordered).toEqual(['id', 'id', 'id'])
  })

  it('the exported CSV carries every book past the cap, not just the first page', async () => {
    // The end-to-end version: the guard that matters is what lands in the file.
    seed(1366) // the library's size after the corpus import
    const lines = (await buildLibraryCsv()).trimEnd().split('\n')
    expect(lines).toHaveLength(1367) // header + every book
    expect(lines.at(-1)).toContain('Book 01365')
  })
})
