import { describe, expect, it } from 'vitest'
import { orderListItems, type ListItemRow } from './listItems'

/**
 * The nullable-ordering class, member 3 of 3 (after lists.sort_order #294 and reads.read_on #296).
 *
 * Three ordinary write paths left `position` NULL — add-one, bulk-add, and the CSV import — so an
 * imported shelf was ENTIRELY NULL. Every row then collapsed to the same sort key, and since
 * Array.prototype.sort is stable, the rendered order was whatever the UNORDERED fetch returned:
 * a shelf that reshuffles between refetches. These drive the pure ordering function rather than
 * the route, which is what makes the shuffle-invariance assertion expressible at all.
 */
const row = (book_id: string, position: number | null, added_at: string): ListItemRow => ({
  list_id: 'l1',
  book_id,
  position,
  added_at,
})

describe('orderListItems — a TOTAL order', () => {
  it('is invariant under fetch order: an all-NULL shelf renders identically from reversed input', () => {
    const items = [
      row('b-zzz', null, '2026-01-03T00:00:00Z'),
      row('b-aaa', null, '2026-01-01T00:00:00Z'),
      row('b-mmm', null, '2026-01-02T00:00:00Z'),
    ]
    const forward = orderListItems(items).map((i) => i.book_id)
    const reversed = orderListItems([...items].reverse()).map((i) => i.book_id)
    expect(forward).toEqual(reversed)
    // and it is the order they were ADDED, not uuid order (b-aaa..b-zzz would be uuid order here
    // only by luck of naming; added_at is the axis under test)
    expect(forward).toEqual(['b-aaa', 'b-mmm', 'b-zzz'])
  })

  it('added_at is the tiebreak, NOT book_id — later-added sorts later even with a smaller id', () => {
    const items = [
      row('b-aaa', null, '2026-06-01T00:00:00Z'), // smallest id, added LAST
      row('b-zzz', null, '2026-01-01T00:00:00Z'), // largest id, added FIRST
    ]
    expect(orderListItems(items).map((i) => i.book_id)).toEqual(['b-zzz', 'b-aaa'])
  })

  it('explicit positions win over added_at, and nulls sort after every positioned row', () => {
    const items = [
      row('b-null', null, '2020-01-01T00:00:00Z'), // oldest, but unpositioned
      row('b-2', 2000, '2026-01-01T00:00:00Z'),
      row('b-1', 1000, '2026-06-01T00:00:00Z'),
    ]
    expect(orderListItems(items).map((i) => i.book_id)).toEqual(['b-1', 'b-2', 'b-null'])
  })

  it('book_id remains the final tiebreak when position AND added_at both tie', () => {
    const items = [
      row('b-b', null, '2026-01-01T00:00:00Z'),
      row('b-a', null, '2026-01-01T00:00:00Z'),
    ]
    const forward = orderListItems(items).map((i) => i.book_id)
    expect(forward).toEqual(orderListItems([...items].reverse()).map((i) => i.book_id))
    expect(forward).toEqual(['b-a', 'b-b'])
  })
})
