import { describe, expect, it } from 'vitest'
import { makeBook } from './book.fixture'
import type { Book } from './types'
import { bylineAuthors, displayTotal, resolveReorder, seriesAuthorKeys } from './seriesIndex'
import type { SeriesEntry } from './seriesShelf'

/** makeBook requires a title; none of these assertions care what it is, so it defaults to the id. */
const bk = (p: Partial<Book> & { id: string }): Book => makeBook({ title: p.id, ...p })

const entry = (p: Partial<SeriesEntry> & { id: string; position: number }): SeriesEntry => ({
  label: null,
  title: p.id,
  author: '',
  bookId: null,
  source: 'manual',
  userEdited: false,
  ...p,
})

describe('byline authors — author/co_author only, matching merge_books', () => {
  it('takes author and co-author in byline order', () => {
    const b = bk({
      id: '1',
      contributors: [
        { name: 'Second Author', role: 'co_author', position: 1 },
        { name: 'First Author', role: 'author', position: 0 },
      ],
    })
    expect(bylineAuthors(b).map((a) => a.name)).toEqual(['First Author', 'Second Author'])
  })

  it('excludes translators, illustrators, narrators and editors', () => {
    const b = bk({
      id: '1',
      contributors: [
        { name: 'Real Author', role: 'author', position: 0 },
        { name: 'A Translator', role: 'translator', position: 1 },
        { name: 'An Illustrator', role: 'illustrator', position: 2 },
        { name: 'A Narrator', role: 'narrator', position: 3 },
        { name: 'An Editor', role: 'editor', position: 4 },
      ],
    })
    expect(bylineAuthors(b).map((a) => a.name)).toEqual(['Real Author'])
  })

  it('falls back to the denormalized first/last when the contributor join is empty', () => {
    const b = bk({ id: '1', first: 'Nell', last: 'Marrow', contributors: [] })
    expect(bylineAuthors(b)).toEqual([{ key: 'nell marrow', name: 'Nell Marrow' }])
  })

  it('dedupes on the normalized key, so spacing and case cannot split one author', () => {
    const b = bk({
      id: '1',
      contributors: [
        { name: 'Ana Huang', role: 'author', position: 0 },
        { name: 'ana  huang', role: 'co_author', position: 1 },
      ],
    })
    expect(bylineAuthors(b)).toHaveLength(1)
  })

  it('yields nothing for a book with no authorship at all', () => {
    expect(bylineAuthors(bk({ id: '1', first: '', last: '', contributors: [] }))).toEqual([])
  })
})

describe('which authors a series files under', () => {
  const libraryBook = bk({
    id: 'b1',
    title: 'Real One',
    series: 'S',
    contributors: [{ name: 'Nell Marrow', role: 'author', position: 0 }],
  })

  it('library books win — their byline authors are the answer', () => {
    const keys = seriesAuthorKeys(
      [libraryBook],
      [entry({ id: 'g', position: 2, author: 'Ghost Writer' })],
    )
    expect(keys.map((k) => k.name)).toEqual(['Nell Marrow'])
  })

  it("a ghost's author string does NOT spawn a second section beside a real author", () => {
    // The typo case: free text on the entry row must not split the series across two authors.
    const keys = seriesAuthorKeys(
      [libraryBook],
      [entry({ id: 'g', position: 2, author: 'Nel Marow' })],
    )
    expect(keys.map((k) => k.key)).toEqual(['nell marrow'])
  })

  it('an ALL-ghost series files under its entries’ author strings, the only signal there is', () => {
    const keys = seriesAuthorKeys(
      [],
      [
        entry({ id: 'g1', position: 1, author: 'Nell Marrow' }),
        entry({ id: 'g2', position: 2, author: 'nell  marrow' }),
      ],
    )
    expect(keys).toEqual([{ key: 'nell marrow', name: 'Nell Marrow' }])
  })

  it('files a co-authored series under BOTH authors', () => {
    const coauthored = bk({
      id: 'b2',
      series: 'S',
      contributors: [
        { name: 'One Writer', role: 'author', position: 0 },
        { name: 'Two Writer', role: 'co_author', position: 1 },
      ],
    })
    expect(seriesAuthorKeys([coauthored], []).map((k) => k.name)).toEqual([
      'One Writer',
      'Two Writer',
    ])
  })
})

describe('a drop resolves to a reorder, a no-op, or an explicit refusal', () => {
  const ids = ['a', 'b', 'c']

  it('resolves a within-list drop to its indices', () => {
    expect(resolveReorder(ids, 'c', 'a')).toEqual({ kind: 'reorder', from: 2, to: 0 })
  })

  it('is a no-op when there is no target, or the target is itself', () => {
    expect(resolveReorder(ids, 'a', null)).toEqual({ kind: 'noop' })
    expect(resolveReorder(ids, 'a', 'a')).toEqual({ kind: 'noop' })
  })

  it('REFUSES a drop whose target belongs to another series, rather than silently doing nothing', () => {
    // The id is a real series_entries uuid — just not one of this list's. Distinguishing this from a
    // no-op is the whole point: one is "nothing to do", the other is "this is not allowed".
    expect(resolveReorder(ids, 'a', 'from-another-series')).toEqual({
      kind: 'reject',
      reason: 'foreign-series',
    })
  })

  it('refuses when the DRAGGED item is the foreign one too', () => {
    expect(resolveReorder(ids, 'from-another-series', 'b')).toEqual({
      kind: 'reject',
      reason: 'foreign-series',
    })
  })
})

describe('display total — compact structured strip', () => {
  it('prefers the entry count when it exceeds what the shelf holds', () => {
    expect(displayTotal(5, 7, 3)).toBe(7)
  })

  it('ignores an entry count that does not exceed the shelf — that is not new information', () => {
    expect(displayTotal(5, 3, 3)).toBe(5)
  })

  it('falls back to series_count, and to null when nothing knows', () => {
    expect(displayTotal(5, null, 2)).toBe(5)
    expect(displayTotal(null, null, 2)).toBeNull()
    // One known membership is not evidence that this is a one-book series.
    expect(displayTotal(null, 1, 1)).toBeNull()
  })
})
