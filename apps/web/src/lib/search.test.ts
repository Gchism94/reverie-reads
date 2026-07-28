import { describe, expect, it } from 'vitest'
import type { Book } from '@reverie/core'
import {
  dedupeResults,
  libraryMatch,
  resultKey,
  resultToIncoming,
  type SearchResult,
} from './search'

const result = (r: Partial<SearchResult>): SearchResult => ({
  source: 'hardcover',
  title: '',
  authors: [],
  cover: '',
  isbn: '',
  year: '',
  ...r,
})

const book = (b: { id?: string; title: string; isbn?: string; author?: string }): Book =>
  ({
    id: b.id ?? 'b1',
    title: b.title,
    isbn: b.isbn ?? '',
    contributors: b.author ? [{ name: b.author, role: 'author', position: 0 }] : [],
    first: b.author?.split(' ')[0] ?? '',
    last: b.author?.split(' ').slice(1).join(' ') ?? '',
  }) as unknown as Book

describe('resultKey', () => {
  it('keys on ISBN-13 when present (dedupes editions across sources)', () => {
    expect(resultKey(result({ isbn13: '978-0-316-58079-2', title: 'A' }))).toBe('9780316580792')
    expect(resultKey(result({ isbn: '0316580791', title: 'A' }))).toBe('0316580791')
  })
  it('falls back to normalized title + first author', () => {
    expect(resultKey(result({ title: 'The Fourth Wing', authors: ['Rebecca Yarros'] }))).toBe(
      'the fourth wing|rebecca yarros',
    )
  })
})

describe('dedupeResults', () => {
  it('collapses the same book from Hardcover + Google', () => {
    const out = dedupeResults([
      result({
        source: 'hardcover',
        title: 'Fourth Wing',
        authors: ['Rebecca Yarros'],
        isbn13: '9781649374042',
      }),
      result({
        source: 'google',
        title: 'Fourth Wing',
        authors: ['Rebecca Yarros'],
        isbn13: '9781649374042',
      }),
      result({
        source: 'google',
        title: 'Iron Flame',
        authors: ['Rebecca Yarros'],
        isbn13: '9781649374172',
      }),
    ])
    expect(out).toHaveLength(2)
    expect(out[0]?.source).toBe('hardcover') // first seen wins → Hardcover leads
  })
  it('dedupes by title+author when ISBNs are absent', () => {
    const out = dedupeResults([
      result({ title: 'Powerless', authors: ['Lauren Roberts'] }),
      result({ title: 'powerless', authors: ['lauren roberts'] }),
    ])
    expect(out).toHaveLength(1)
  })
})

describe('resultToIncoming', () => {
  it('splits the author and carries ISBN + series', () => {
    const inc = resultToIncoming(
      result({
        title: 'Zephyr',
        authors: ['Imogen Vale'],
        isbn13: '9780316580792',
        series: 'Windborne',
        seriesPosition: 2,
      }),
    )
    expect(inc).toMatchObject({
      title: 'Zephyr',
      first: 'Imogen',
      last: 'Vale',
      isbn: '9780316580792',
      series: 'Windborne',
      position: 2,
    })
  })
})

describe('libraryMatch (de-dupe against the library)', () => {
  const library = [
    book({ id: 'lib1', title: 'Fourth Wing', author: 'Rebecca Yarros', isbn: '9781649374042' }),
    book({ id: 'lib2', title: 'It Ends with Us', author: 'Colleen Hoover' }),
  ]
  it('matches by ISBN', () => {
    const m = libraryMatch(
      result({
        title: 'Fourth Wing (special ed.)',
        authors: ['Rebecca Yarros'],
        isbn13: '9781649374042',
      }),
      library,
    )
    expect(m?.id).toBe('lib1')
  })
  it('matches by title + author when no ISBN', () => {
    const m = libraryMatch(
      result({ title: 'It Ends with Us', authors: ['Colleen Hoover'] }),
      library,
    )
    expect(m?.id).toBe('lib2')
  })
  it('returns null for a book not in the library', () => {
    expect(libraryMatch(result({ title: 'Brand New', authors: ['Nobody'] }), library)).toBeNull()
  })
})
