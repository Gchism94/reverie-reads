import { describe, expect, it } from 'vitest'
import {
  appendPosition,
  expandOrder,
  insertPositionAt,
  needsRenumber,
  nextInOrder,
  orderProgress,
  ordersForBook,
  POSITION_STEP,
  renumberItems,
  reorderItems,
  sortItems,
  type ReadingOrder,
  type ReadingOrderItem,
} from './readingOrders'
import { makeBook } from './book.fixture'

const bookItem = (id: string, bookId: string, position: number, note?: string): ReadingOrderItem => ({
  id,
  kind: 'book',
  bookId,
  position,
  note,
})
const seriesItem = (id: string, series: string, position: number): ReadingOrderItem => ({ id, kind: 'series', series, position })

// A small interleaved library: two series + a standalone.
const library = [
  makeBook({ id: 'a1', title: 'Alpha 1', series: 'Alpha', position: 1, readStatus: 'Read' }),
  makeBook({ id: 'a2', title: 'Alpha 2', series: 'Alpha', position: 2, readStatus: 'Unread' }),
  makeBook({ id: 'b1', title: 'Beta 1', series: 'Beta', position: 1, readStatus: 'Unread' }),
  makeBook({ id: 'b2', title: 'Beta 2', series: 'Beta', position: 2, readStatus: 'Unread' }),
  makeBook({ id: 's0', title: 'Standalone', series: '', position: '', readStatus: 'Unread' }),
]

describe('positions: append + insert + sort', () => {
  it('appends after the last; empty list starts at the step', () => {
    expect(appendPosition([])).toBe(POSITION_STEP)
    expect(appendPosition([bookItem('1', 'a1', 1024), bookItem('2', 'a2', 2048)])).toBe(3072)
  })
  it('inserts at a midpoint between neighbours (and at the ends)', () => {
    const items = [bookItem('1', 'a1', 1000), bookItem('2', 'a2', 2000)]
    expect(insertPositionAt(items, 1)).toBe(1500) // between
    expect(insertPositionAt(items, 0)).toBe(1000 - POSITION_STEP) // before first
    expect(insertPositionAt(items, 2)).toBe(2000 + POSITION_STEP) // after last
  })
})

describe('reorder stability (no collisions over many moves)', () => {
  it('keeps positions strictly increasing and distinct', () => {
    let items: ReadingOrderItem[] = renumberItems([
      bookItem('1', 'a1', 0),
      bookItem('2', 'a2', 0),
      bookItem('3', 'b1', 0),
      bookItem('4', 'b2', 0),
      bookItem('5', 's0', 0),
    ])
    // Repeatedly shuffle the last item to the front, then a middle move — a stress test.
    const moves: [string, number][] = [
      ['5', 0], ['1', 3], ['4', 1], ['2', 4], ['3', 0], ['5', 2], ['1', 4],
    ]
    for (const [id, to] of moves) {
      items = reorderItems(items, id, to)
      const sorted = sortItems(items)
      const positions = sorted.map((i) => i.position)
      // strictly increasing, all distinct
      for (let i = 1; i < positions.length; i++) expect(positions[i]).toBeGreaterThan(positions[i - 1]!)
      expect(new Set(positions).size).toBe(positions.length)
    }
  })
  it('renumbers when a midpoint would collide', () => {
    const tight = [bookItem('1', 'a1', 1), bookItem('2', 'a2', 2), bookItem('3', 'b1', 3)]
    // force a near-collision by moving into an already-tight gap repeatedly
    let items = tight
    for (let i = 0; i < 60; i++) items = reorderItems(items, '3', 1)
    expect(needsRenumber(items)).toBe(false)
    expect(new Set(sortItems(items).map((i) => i.position)).size).toBe(3)
  })
})

describe('expandOrder — series expansion + dedupe + interleaving', () => {
  it('interleaves two series and a standalone in the authored order', () => {
    const items = [
      seriesItem('i1', 'Alpha', 1000), // → a1, a2
      bookItem('i2', 's0', 2000), // standalone between the series
      seriesItem('i3', 'Beta', 3000), // → b1, b2
    ]
    const seq = expandOrder(items, library).map((e) => e.book.id)
    expect(seq).toEqual(['a1', 'a2', 's0', 'b1', 'b2'])
  })
  it('lets a book item interleave INTO another series (custom sequence)', () => {
    const items = [
      bookItem('i1', 'a1', 1000),
      bookItem('i2', 'b1', 2000),
      bookItem('i3', 'a2', 3000),
      bookItem('i4', 'b2', 4000),
    ]
    expect(expandOrder(items, library).map((e) => e.book.id)).toEqual(['a1', 'b1', 'a2', 'b2'])
  })
  it('dedupes a book listed explicitly and inside an expanded series (first slot wins)', () => {
    const items = [
      bookItem('i1', 'a2', 1000), // explicit a2 first
      seriesItem('i2', 'Alpha', 2000), // expands to a1, a2 — a2 already seen
    ]
    expect(expandOrder(items, library).map((e) => e.book.id)).toEqual(['a2', 'a1'])
  })
  it('skips items whose book is missing from the library', () => {
    expect(expandOrder([bookItem('i1', 'ghost', 1000)], library)).toEqual([])
  })
})

describe('next-to-read + progress', () => {
  it('next is the first unread along the order, respecting read status', () => {
    const items = [seriesItem('i1', 'Alpha', 1000)] // a1 Read, a2 Unread
    expect(nextInOrder(expandOrder(items, library))?.book.id).toBe('a2')
  })
  it('progress counts read vs total of the expanded sequence', () => {
    const items = [seriesItem('i1', 'Alpha', 1000), bookItem('i2', 's0', 2000)]
    expect(orderProgress(expandOrder(items, library))).toEqual({ read: 1, total: 3 })
  })
})

describe('ordersForBook', () => {
  it('finds orders that include a book explicitly or via its series', () => {
    const orders: ReadingOrder[] = [
      { id: 'o1', name: 'Explicit', items: [bookItem('i1', 'b1', 1000)] },
      { id: 'o2', name: 'Via series', items: [seriesItem('i2', 'Alpha', 1000)] },
    ]
    const a2 = library.find((b) => b.id === 'a2')!
    const b1 = library.find((b) => b.id === 'b1')!
    expect(ordersForBook(a2, orders).map((o) => o.id)).toEqual(['o2'])
    expect(ordersForBook(b1, orders).map((o) => o.id)).toEqual(['o1'])
  })
})
