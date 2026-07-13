import { describe, expect, it } from 'vitest'
import { findDuplicateGroups, mergeBooks, type LibraryState } from './merge'
import { makeBook } from './book.fixture'

const alpha = makeBook({
  id: 'a',
  title: 'Iron Flame',
  last: 'Yarros',
  tags: ['Dragon Riders'],
  reads: [{ date: '2025-01-01', format: 'ebook', rating: 4, notes: '' }],
  cover: 'a.jpg',
  rating: 4,
  owned: { physical: 'paperback', ebook: false, audiobook: false },
})
const beta = makeBook({
  id: 'b',
  title: 'Iron Flame',
  last: 'Yarros',
  tags: ['Enemies to Lovers'],
  reads: [
    { date: '2025-01-01', format: 'paperback', rating: 0, notes: '' }, // duplicate date
    { date: '2025-06-01', format: 'paperback', rating: 5, notes: '' },
  ],
  fave: true,
  intensity: 5,
  owned: { physical: false, ebook: true, audiobook: false },
})

const initial: LibraryState = {
  books: [alpha, beta],
  tbrs: [{ id: 't1', name: 'Priority TBR', priority: true, ids: ['b'] }],
  collections: [{ id: 'c1', name: 'Faves', ids: ['a', 'b'] }],
}

describe('mergeBooks', () => {
  it('unions reads (dedup by date), tags; ORs fave; maxes intensity; remaps lists; drops loser', () => {
    const next = mergeBooks(initial, 'a', ['b'])

    expect(next.books).toHaveLength(1)
    const [m] = next.books
    if (!m) throw new Error('expected a merged book')

    expect(m.id).toBe('a')
    expect(m.reads.map((r) => r.date).sort()).toEqual(['2025-01-01', '2025-06-01'])
    expect(new Set(m.tags)).toEqual(new Set(['Dragon Riders', 'Enemies to Lovers']))
    expect(m.fave).toBe(true)
    expect(m.intensity).toBe(5)
    expect(m.owned).toEqual({ physical: 'paperback', ebook: true, audiobook: false }) // union
    expect(m.readStatus).toBe('Read') // reads present => Read

    // list memberships remapped onto the primary and deduped
    expect(next.tbrs[0]?.ids).toEqual(['a'])
    expect(next.collections[0]?.ids).toEqual(['a'])
  })

  it('does not mutate the input state', () => {
    const snapshot = JSON.stringify(initial)
    mergeBooks(initial, 'a', ['b'])
    expect(JSON.stringify(initial)).toBe(snapshot)
  })

  it('returns the same state when the primary is missing', () => {
    expect(mergeBooks(initial, 'missing', ['b'])).toBe(initial)
  })
})

describe('findDuplicateGroups', () => {
  it('groups by normalized title + author', () => {
    const groups = findDuplicateGroups(initial.books)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(2)
  })

  it('ignores singletons', () => {
    expect(findDuplicateGroups([alpha])).toHaveLength(0)
  })
})

describe('ownership on merge', () => {
  const state = (a: Parameters<typeof makeBook>[0], b: Parameters<typeof makeBook>[0]): LibraryState => ({
    books: [makeBook(a), makeBook(b)],
    tbrs: [],
    collections: [],
  })

  it('one owned copy makes the merged record owned', () => {
    const next = mergeBooks(state({ id: 'a', title: 'T', ownership: 'unowned' }, { id: 'b', title: 'T', ownership: 'owned' }), 'a', ['b'])
    expect(next.books.find((b) => b.id === 'a')!.ownership).toBe('owned')
  })

  it('two wishlist copies stay wishlist', () => {
    const next = mergeBooks(state({ id: 'a', title: 'T', ownership: 'unowned' }, { id: 'b', title: 'T', ownership: 'unowned' }), 'a', ['b'])
    expect(next.books.find((b) => b.id === 'a')!.ownership).toBe('unowned')
  })
})

describe('merge unions subgenres', () => {
  it('keeps the primary book’s order first and mirrors the single field', () => {
    const primary = makeBook({ id: 'p', title: 'Primary', subgenre: 'Epic Fantasy', subgenres: ['Epic Fantasy', 'Romantasy'] })
    const loser = makeBook({ id: 'l', title: 'Dupe', subgenre: 'Dark Fantasy', subgenres: ['Dark Fantasy', 'Romantasy'] })
    const state: LibraryState = { books: [primary, loser], tbrs: [], collections: [] }
    const merged = mergeBooks(state, 'p', ['l']).books[0]!
    expect(merged.subgenres).toEqual(['Epic Fantasy', 'Romantasy', 'Dark Fantasy'])
    expect(merged.subgenre).toBe('Epic Fantasy')
  })
})
