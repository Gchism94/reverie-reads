import { describe, expect, it } from 'vitest'
import { CORE_GENRES, type Book } from '@reverie/core'
import {
  dedupeHits,
  discoverQuery,
  GENRE_DISCOVER_QUERY,
  isOwned,
  ownedKeys,
  sortByTaste,
  volumeToHit,
  type DiscoverHit,
} from './discover'

const hit = (h: Partial<DiscoverHit>): DiscoverHit => ({
  title: '',
  authors: [],
  cover: '',
  isbn: '',
  pub: '',
  ...h,
})

const book = (b: { title: string; isbn?: string; author?: string }): Book =>
  ({
    title: b.title,
    isbn: b.isbn ?? '',
    contributors: b.author ? [{ name: b.author, role: 'author' }] : [],
  }) as unknown as Book

describe('discover — genre queries', () => {
  it('covers exactly the nine canonical genres (same alignment guard as the taxonomies)', () => {
    expect(Object.keys(GENRE_DISCOVER_QUERY).sort()).toEqual(
      CORE_GENRES.map((g) => g.toLowerCase()).sort(),
    )
  })

  it('resolves any genre spelling via genreKey; unknown genres browse themselves', () => {
    expect(discoverQuery('Sci-Fi')).toBe(GENRE_DISCOVER_QUERY['science fiction'])
    expect(discoverQuery('Thriller')).toBe(GENRE_DISCOVER_QUERY.mystery)
    expect(discoverQuery('Science fiction')).toBe(GENRE_DISCOVER_QUERY['science fiction'])
    expect(discoverQuery('gardening')).toBe('subject:"gardening"')
  })
})

describe('discover — volume mapping', () => {
  it('maps a raw volume: https cover, edge=curl stripped, ISBN-13 preferred', () => {
    const h = volumeToHit({
      volumeInfo: {
        title: 'Iron Flame',
        authors: ['Rebecca Yarros'],
        publishedDate: '2023-11-07',
        imageLinks: { thumbnail: 'http://books.google.com/x.jpg&edge=curl' },
        industryIdentifiers: [
          { type: 'ISBN_10', identifier: '1649374178' },
          { type: 'ISBN_13', identifier: '9781649374172' },
        ],
      },
    })
    expect(h).toEqual({
      title: 'Iron Flame',
      authors: ['Rebecca Yarros'],
      cover: 'https://books.google.com/x.jpg',
      isbn: '9781649374172',
      pub: '2023-11-07',
    })
  })
})

describe('discover — dedupe', () => {
  it('collapses by ISBN and by title+author; keeps genuinely distinct hits', () => {
    const hits = [
      hit({ title: 'Fourth Wing', authors: ['Rebecca Yarros'], isbn: '9781649374042' }),
      hit({ title: 'Fourth Wing (Special)', authors: ['Rebecca Yarros'], isbn: '9781649374042' }),
      hit({ title: 'Fourth Wing', authors: ['Rebecca Yarros'] }), // no isbn — same title/author
      hit({ title: 'Iron Flame', authors: ['Rebecca Yarros'], isbn: '9781649374172' }),
    ]
    const out = dedupeHits(hits)
    expect(out.map((h) => h.title)).toEqual(['Fourth Wing', 'Iron Flame'])
  })
})

describe('discover — ownership', () => {
  const owned = ownedKeys([
    book({
      title: 'A Court of Thorns and Roses',
      isbn: '978-1-63557-556-9',
      author: 'Sarah J. Maas',
    }),
    book({ title: 'King of Wrath', author: 'Ana Huang' }),
  ])

  it('matches by ISBN regardless of formatting', () => {
    expect(isOwned(hit({ title: 'ACOTAR (any edition)', isbn: '9781635575569' }), owned)).toBe(true)
  })

  it('matches by title + first author, case- and punctuation-insensitive', () => {
    expect(isOwned(hit({ title: 'KING OF WRATH', authors: ['ana huang'] }), owned)).toBe(true)
    expect(
      isOwned(hit({ title: 'A Court of Thorns & Roses…', authors: ['Sarah J Maas'] }), owned),
    ).toBe(false) // '&' ≠ 'and' — aliasing stays out of v1
  })

  it('does not claim strangers', () => {
    expect(
      isOwned(
        hit({ title: 'King of Pride', authors: ['Ana Huang'], isbn: '9781728289731' }),
        owned,
      ),
    ).toBe(false)
  })
})

describe('discover — taste ordering (Tier 2b)', () => {
  const a = hit({ title: 'A', authors: ['X'], isbn: '1111111111' })
  const b = hit({ title: 'B', authors: ['X'], isbn: '2222222222' })
  const c = hit({ title: 'C', authors: ['X'], isbn: '3333333333' })

  it('scored hits sort closest-first; unscored keep catalog order behind them', () => {
    const out = sortByTaste([a, b, c], { [`1111111111`]: 0.71, [`3333333333`]: 0.9 })
    expect(out.map((x) => x.hit.title)).toEqual(['C', 'A', 'B'])
    expect(out[0]?.taste).toBeCloseTo(0.9)
    expect(out[2]?.taste).toBeUndefined()
  })

  it('no scores at all → pure catalog order, no annotations', () => {
    const out = sortByTaste([a, b, c], {})
    expect(out.map((x) => x.hit.title)).toEqual(['A', 'B', 'C'])
    expect(out.every((x) => x.taste == null)).toBe(true)
  })
})
