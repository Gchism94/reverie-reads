import { describe, expect, it } from 'vitest'
import {
  activeFilterCount,
  defaultFilters,
  groupSeries,
  matchesFilters,
  seriesLenBucket,
  sortBooks,
} from './filters'
import { makeBook } from './book.fixture'

describe('matchesFilters', () => {
  const book = makeBook({
    id: '1',
    title: 'Iron Flame',
    last: 'Yarros',
    series: 'The Empyrean',
    subgenre: 'Romantasy',
    tags: ['Dragon Riders', 'Enemies to Lovers'],
    status: 'ongoing',
    readStatus: 'Read',
    fave: true,
  })

  it('requires ALL selected tropes to be present', () => {
    expect(matchesFilters(book, { ...defaultFilters(), tags: ['Dragon Riders'] })).toBe(true)
    expect(
      matchesFilters(book, { ...defaultFilters(), tags: ['Dragon Riders', 'Mafia'] }),
    ).toBe(false)
  })

  it('matches subgenre, fave, and free-text search across fields', () => {
    expect(matchesFilters(book, { ...defaultFilters(), sub: 'Dark Romance' })).toBe(false)
    expect(matchesFilters(book, { ...defaultFilters(), fave: true })).toBe(true)
    expect(matchesFilters(book, { ...defaultFilters(), q: 'yarros' })).toBe(true)
    expect(matchesFilters(book, { ...defaultFilters(), q: 'empyrean' })).toBe(true)
    expect(matchesFilters(book, { ...defaultFilters(), q: 'nope' })).toBe(false)
  })

  it('treats logged reads as Read for the reading-status filter', () => {
    const unreadButLogged = makeBook({
      id: '2',
      title: 'X',
      readStatus: 'Unread',
      reads: [{ date: '2025-01-01', format: 'ebook', rating: 0, notes: '' }],
    })
    expect(matchesFilters(unreadButLogged, { ...defaultFilters(), read: 'Read' })).toBe(true)
    expect(matchesFilters(unreadButLogged, { ...defaultFilters(), read: 'Unread' })).toBe(false)
  })

  it('filters by intensity/spice level (empty = any, set = membership)', () => {
    const spicy = makeBook({ id: 's', title: 'Spicy', intensity: 4 })
    const sweet = makeBook({ id: 'w', title: 'Sweet', intensity: 1 })
    expect(matchesFilters(spicy, { ...defaultFilters(), intensity: [] })).toBe(true) // any
    expect(matchesFilters(spicy, { ...defaultFilters(), intensity: [4, 5] })).toBe(true)
    expect(matchesFilters(sweet, { ...defaultFilters(), intensity: [4, 5] })).toBe(false)
    // an unrated book (intensity 0/undefined) never matches a positive-level filter
    expect(matchesFilters(makeBook({ id: 'z', title: 'Z', intensity: 0 }), { ...defaultFilters(), intensity: [3] })).toBe(false)
  })
})

describe('seriesLenBucket', () => {
  it('buckets by series length, with null => Unknown and 5+ collapsed', () => {
    expect(seriesLenBucket(makeBook({ id: '1', title: 'a', seriesCount: null }))).toBe('Unknown')
    expect(seriesLenBucket(makeBook({ id: '2', title: 'b', seriesCount: 3 }))).toBe('3')
    expect(seriesLenBucket(makeBook({ id: '3', title: 'c', seriesCount: 7 }))).toBe('5+')
  })
})

describe('sortBooks', () => {
  it('sorts A–Z by title', () => {
    const books = [
      makeBook({ id: '1', title: 'Zodiac' }),
      makeBook({ id: '2', title: 'Apple' }),
    ]
    expect(sortBooks(books, 'az').map((b) => b.title)).toEqual(['Apple', 'Zodiac'])
  })
})

describe('groupSeries', () => {
  it('groups by series with owned/total/read and position order', () => {
    const books = [
      makeBook({ id: '1', title: 'Book 2', series: 'S', position: 2, readStatus: 'Read' }),
      makeBook({ id: '2', title: 'Book 1', series: 'S', position: 1, seriesCount: 4 }),
      makeBook({ id: '3', title: 'Standalone', series: '' }),
    ]
    const groups = groupSeries(books)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.name).toBe('S')
    expect(groups[0]?.books.map((b) => b.title)).toEqual(['Book 1', 'Book 2'])
    expect(groups[0]?.total).toBe(4)
    expect(groups[0]?.owned).toBe(2)
    expect(groups[0]?.read).toBe(1)
  })
})

describe('activeFilterCount', () => {
  it('counts each active facet (search excluded)', () => {
    expect(activeFilterCount(defaultFilters())).toBe(0)
    expect(
      activeFilterCount({ ...defaultFilters(), sub: 'Romantasy', tags: ['Fae'], fave: true, q: 'x' }),
    ).toBe(3)
    // intensity counts as one facet however many levels are picked
    expect(activeFilterCount({ ...defaultFilters(), intensity: [3, 4, 5] })).toBe(1)
  })
})

describe('ownership scoping — default library = have or have read (task-ownership-v2)', () => {
  const owned = makeBook({ id: 'o', title: 'Owned One' })
  const borrowed = makeBook({ id: 'b', title: 'Borrowed One', ownership: 'borrowed', readStatus: 'unset' })
  const wished = makeBook({ id: 'w', title: 'Wished One', ownership: 'wishlist', readStatus: 'unset' })
  const unset = makeBook({ id: 'u', title: 'Uncatalogued', ownership: 'unset', readStatus: 'unset' })
  // the reading-history hole: read it, don't own it, never marked it borrowed
  const readNotOwned = makeBook({ id: 'r', title: 'Read Not Owned', ownership: 'wishlist', readStatus: 'Read' })

  it('default grid shows owned, borrowed, and anything read — hides wishlist/unset you have not read', () => {
    const f = defaultFilters()
    expect(matchesFilters(owned, f)).toBe(true)
    expect(matchesFilters(borrowed, f)).toBe(true) // in hand, though not owned
    expect(matchesFilters(readNotOwned, f)).toBe(true) // reading history never hidden by possession
    expect(matchesFilters(wished, f)).toBe(false)
    expect(matchesFilters(unset, f)).toBe(false)
  })

  it('the wishlist flag lets the hidden remainder (wishlist + unset) in', () => {
    const f = { ...defaultFilters(), wishlist: true }
    expect(matchesFilters(owned, f)).toBe(true)
    expect(matchesFilters(wished, f)).toBe(true)
    expect(matchesFilters(unset, f)).toBe(true)
  })

  it('counts as an active filter', () => {
    expect(activeFilterCount({ ...defaultFilters(), wishlist: true })).toBe(1)
  })
})

describe('subgenre filter over subgenres[]', () => {
  const multi = makeBook({ id: 'm', title: 'Many Shelves', subgenre: 'Epic Fantasy', subgenres: ['Epic Fantasy', 'Romantasy', 'Dark Fantasy'] })
  const legacy = makeBook({ id: 'l', title: 'Old Single', subgenre: 'Noir', subgenres: [] })

  it('a book appears under EVERY subgenre it holds', () => {
    for (const sub of ['Epic Fantasy', 'Romantasy', 'Dark Fantasy']) {
      expect(matchesFilters(multi, { ...defaultFilters(), sub })).toBe(true)
    }
    expect(matchesFilters(multi, { ...defaultFilters(), sub: 'Noir' })).toBe(false)
  })

  it('pre-migration singles still match through the legacy field', () => {
    expect(matchesFilters(legacy, { ...defaultFilters(), sub: 'Noir' })).toBe(true)
    expect(matchesFilters(legacy, { ...defaultFilters(), sub: 'Gothic' })).toBe(false)
  })
})
