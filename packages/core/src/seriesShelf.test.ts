import { describe, expect, it } from 'vitest'
import { makeBook } from './book.fixture'
import {
  entryAfterBook,
  mergeSourceEntries,
  entryState,
  ghostMatchesBook,
  nextUp,
  positionBetween,
  progressLine,
  renumberEntries,
  seriesProgress,
  sortEntries,
  type SeriesEntry,
} from './seriesShelf'

const entry = (p: Partial<SeriesEntry> & { id: string; position: number }): SeriesEntry => ({
  label: null,
  title: p.id,
  author: '',
  bookId: null,
  source: 'manual',
  userEdited: false,
  ...p,
})

const read = makeBook({ id: 'r', title: 'Read One', readStatus: 'Read' })
const reading = makeBook({ id: 'c', title: 'Current', readStatus: 'Reading' })
const unread = makeBook({ id: 'u', title: 'Owned Unread' })
const wished = makeBook({ id: 'w', title: 'Wished', ownership: 'wishlist' })
const borrowed = makeBook({ id: 'bw', title: 'Borrowed Unread', ownership: 'borrowed' })
const byId = new Map([read, reading, unread, wished].map((b) => [b.id, b]))

describe('entry ordering and state', () => {
  it('sorts by position with decimals interleaved', () => {
    const ids = sortEntries([entry({ id: 'a', position: 3 }), entry({ id: 'b', position: 0.5 }), entry({ id: 'c', position: 2.5 }), entry({ id: 'd', position: 1 })]).map((e) => e.id)
    expect(ids).toEqual(['b', 'd', 'c', 'a'])
  })

  it('names every state the page renders', () => {
    expect(entryState(undefined, false)).toBe('ghost')
    expect(entryState(read, false)).toBe('read')
    expect(entryState(reading, true)).toBe('reading') // reading outranks tbr
    expect(entryState(unread, true)).toBe('tbr')
    expect(entryState(unread, false)).toBe('unread')
    expect(entryState(wished, false)).toBe('wishlist')
    expect(entryState(borrowed, false)).toBe('unread') // borrowed = in hand, not "to get"
  })
})

describe('next up + chain target', () => {
  const entries = [
    entry({ id: 'e1', position: 1, bookId: 'r' }),
    entry({ id: 'e2', position: 2, bookId: 'u' }),
    entry({ id: 'e25', position: 2.5, title: 'Ghost Novella' }),
    entry({ id: 'e3', position: 3, bookId: 'w' }),
  ]

  it('next up is the first entry not yet read — a read book never elevates', () => {
    expect(nextUp(entries, byId)?.id).toBe('e2')
  })

  it('a ghost can be next up (acquisition framing)', () => {
    const ghostFirst = [entry({ id: 'g', position: 0.5, title: 'Prequel' }), ...entries]
    expect(nextUp(ghostFirst, byId)?.id).toBe('g')
  })

  it('chain prompt targets the first unfinished entry AFTER the finished book', () => {
    expect(entryAfterBook(entries, 'r', byId)?.id).toBe('e2')
    expect(entryAfterBook(entries, 'u', byId)?.id).toBe('e25') // the ghost novella is next
    expect(entryAfterBook(entries, 'w', byId)).toBeNull()
    expect(entryAfterBook(entries, 'missing', byId)).toBeNull()
  })

  it('progress counts read + to-get (ghosts and wishlist copies)', () => {
    const p = seriesProgress(entries, byId)
    expect(p).toEqual({ read: 1, total: 4, toGet: 2 })
    expect(progressLine(p)).toBe('Read 1 of 4 · 2 to get')
    expect(progressLine({ read: 2, total: 2, toGet: 0 })).toBe('Read 2 of 2')
  })
})

describe('decimal positioning (drag-to-reorder)', () => {
  it('drop between #2 and #3 lands exactly 2.5', () => {
    expect(positionBetween(2, 3)).toEqual({ position: 2.5, renumber: false })
  })
  it('prefers one clean decimal, then two', () => {
    expect(positionBetween(2, 2.5)).toEqual({ position: 2.3, renumber: false })
    expect(positionBetween(2.4, 2.5)).toEqual({ position: 2.45, renumber: false })
  })
  it('asks for a renumber when neighbours are too tight', () => {
    const r = positionBetween(2.44, 2.45)
    expect(r.renumber).toBe(true)
    expect(r.position).toBeGreaterThan(2.44)
    expect(r.position).toBeLessThan(2.45)
  })
  it('handles the edges: empty, before-first (prequel space), after-last', () => {
    expect(positionBetween(null, null)).toEqual({ position: 1, renumber: false })
    expect(positionBetween(null, 1)).toEqual({ position: 0, renumber: false })
    expect(positionBetween(7, null)).toEqual({ position: 8, renumber: false })
    expect(positionBetween(2.5, null)).toEqual({ position: 3, renumber: false })
  })
  it('renumber renormalizes to integers in current order', () => {
    const out = renumberEntries([entry({ id: 'a', position: 2.44 }), entry({ id: 'b', position: 0.5 }), entry({ id: 'c', position: 2.45 })])
    expect(out.map((e) => [e.id, e.position])).toEqual([['b', 1], ['a', 2], ['c', 3]])
  })
})

describe('ghost adoption', () => {
  it('matches by normalized title, only for unlinked entries', () => {
    const g = entry({ id: 'g', position: 4, title: '  The Winter Door ' })
    expect(ghostMatchesBook(g, { title: 'the winter door' })).toBe(true)
    expect(ghostMatchesBook({ ...g, bookId: 'x' }, { title: 'the winter door' })).toBe(false)
    expect(ghostMatchesBook(g, { title: 'Another Door' })).toBe(false)
  })
})

describe('source merge — fills gaps, never overwrites', () => {
  const existing = [
    entry({ id: 'user', position: 1, title: 'Book One', userEdited: true, source: 'hardcover' }),
    entry({ id: 'manual', position: 2, title: 'Book Two', source: 'manual' }),
    entry({ id: 'hc', position: 9, title: 'Book Three', source: 'hardcover' }),
  ]
  const src = [
    { position: 5, title: 'Book One', author: 'A' }, // user-edited — must not move
    { position: 6, title: 'book two ', author: 'A' }, // manual entry — must not move
    { position: 3, title: 'Book Three', author: 'A' }, // hardcover + untouched — may follow catalog
    { position: 4, title: 'Book Four', author: 'A' }, // new canonical slot — ghost insert
    { position: 0, title: '', author: '' }, // catalog noise
  ]

  it('inserts only the unknown slot, moves only the never-edited hardcover row', () => {
    const { inserts, moves } = mergeSourceEntries(existing, src)
    expect(inserts).toEqual([{ position: 4, title: 'Book Four', author: 'A' }])
    expect(moves).toEqual([{ id: 'hc', position: 3 }])
  })

  it('deletes nothing by construction — a slot the catalog dropped simply stays', () => {
    const { inserts, moves } = mergeSourceEntries(existing, [])
    expect(inserts).toEqual([])
    expect(moves).toEqual([])
  })
})
