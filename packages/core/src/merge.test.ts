import { describe, expect, it } from 'vitest'
import { findDuplicateGroups, mergeBooks, type LibraryState } from './merge'
import { makeBook } from './book.fixture'
import { possessionPatch, possessionState } from './ownership'
import type { PossessionState } from './types'

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

describe('possession on merge', () => {
  const state = (
    a: Parameters<typeof makeBook>[0],
    b: Parameters<typeof makeBook>[0],
  ): LibraryState => ({
    books: [makeBook(a), makeBook(b)],
    tbrs: [],
    collections: [],
  })

  /** Merge two records described by their possession WORD and read the survivor's word back. */
  const mergeWords = (a: PossessionState, b: PossessionState): PossessionState => {
    const next = mergeBooks(
      state(
        { id: 'a', title: 'T', ...possessionPatch(a) },
        { id: 'b', title: 'T', ...possessionPatch(b) },
      ),
      'a',
      ['b'],
    )
    return possessionState(next.books.find((x) => x.id === 'a')!)
  }

  it('one owned copy makes the merged record owned', () => {
    expect(mergeWords('wishlist', 'owned')).toBe('owned')
  })

  it('two wishlist copies stay wishlist', () => {
    expect(mergeWords('wishlist', 'wishlist')).toBe('wishlist')
  })

  it('borrowed loses to owned but beats wishlist (strongest possession wins)', () => {
    expect(mergeWords('borrowed', 'owned')).toBe('owned')
    expect(mergeWords('wishlist', 'borrowed')).toBe('borrowed')
  })

  it('a borrowed copy SURVIVES a merge with an owned one — the old model dropped it', () => {
    // Under the four-state enum this collapsed to 'owned' and the fact that a borrowed copy was
    // also in hand was lost. The word is still 'owned'; the flag is the new information.
    const next = mergeBooks(
      state(
        { id: 'a', title: 'T', ...possessionPatch('borrowed') },
        { id: 'b', title: 'T', ...possessionPatch('owned') },
      ),
      'a',
      ['b'],
    )
    const survivor = next.books.find((x) => x.id === 'a')!
    expect(survivor.ownership).toBe('owned')
    expect(survivor.borrowed).toBe(true)
  })
})

describe('merge unions subgenres', () => {
  it('keeps the primary book’s order first and mirrors the single field', () => {
    const primary = makeBook({
      id: 'p',
      title: 'Primary',
      subgenre: 'Epic Fantasy',
      subgenres: ['Epic Fantasy', 'Romantasy'],
    })
    const loser = makeBook({
      id: 'l',
      title: 'Dupe',
      subgenre: 'Dark Fantasy',
      subgenres: ['Dark Fantasy', 'Romantasy'],
    })
    const state: LibraryState = { books: [primary, loser], tbrs: [], collections: [] }
    const merged = mergeBooks(state, 'p', ['l']).books[0]!
    expect(merged.subgenres).toEqual(['Epic Fantasy', 'Romantasy', 'Dark Fantasy'])
    expect(merged.subgenre).toBe('Epic Fantasy')
  })
})
