import { describe, expect, it } from 'vitest'
import { makeBook } from './book.fixture'
import { activeFilterCount, defaultFilters, matchesFilters, sortBooks } from './filters'
import { DARKNESS_LEVEL_GUIDE, SPICE_LEVEL_GUIDE } from './labels'
import type { Book } from './types'

/**
 * The darkness axis, held to the SAME null/0 contract intensity earned in #326 — null = not
 * assessed, 0 = assessed as none, never collapsed.
 *
 * This mirrors intensityNullSemantics.test.ts deliberately. The two axes are independent columns
 * with independent filters, and the way a second field of the same shape goes wrong is by quietly
 * inheriting the FIRST field's bugs (a `?? 0`, a sentinel sort) at its own call sites. Asserting
 * the contract twice is what stops that.
 *
 * The distribution here is the real starting state rather than an invented one: every existing
 * book has darkness NULL, because the migration adds the column with no default and no backfill.
 */

const b = (id: string, darkness: number | null, intensity: number | null = null): Book =>
  makeBook({ id, title: `Book ${id}`, darkness, intensity })

const library: Book[] = [
  b('none', 0),
  b('one', 1),
  b('four', 4),
  b('five', 5),
  b('unassessed-a', null),
  b('unassessed-b', null),
  // a book assessed on the OTHER axis only — the state every book is in right after the migration
  b('spicy-but-unrated-darkness', null, 5),
]

const filterBy = (levels: (number | null)[]) =>
  library.filter((x) => matchesFilters(x, { ...defaultFilters(), darkness: levels }))

describe('darkness inherits intensity’s null/0 contract', () => {
  it('selecting "none" (0) returns only the assessed-as-none book, never the unassessed', () => {
    const hit = filterBy([0])
    expect(hit.map((x) => x.id)).toEqual(['none'])
  })

  it('selecting "not assessed" (null) returns every unassessed book, never the 0', () => {
    expect(
      filterBy([null])
        .map((x) => x.id)
        .sort(),
    ).toEqual(['spicy-but-unrated-darkness', 'unassessed-a', 'unassessed-b'])
  })

  it('every book is reachable by some selection', () => {
    expect(filterBy([null, 0, 1, 2, 3, 4, 5])).toHaveLength(library.length)
  })

  it('counts as one active filter, like intensity', () => {
    expect(activeFilterCount({ ...defaultFilters(), darkness: [3] })).toBe(1)
  })
})

describe('the two axes are independent', () => {
  it('a darkness filter ignores intensity entirely, and vice versa', () => {
    // the spicy book is unassessed for darkness: a darkness-5 filter must NOT find it
    expect(filterBy([5]).map((x) => x.id)).toEqual(['five'])
    const bySpice = library.filter((x) =>
      matchesFilters(x, { ...defaultFilters(), intensity: [5] }),
    )
    expect(bySpice.map((x) => x.id)).toEqual(['spicy-but-unrated-darkness'])
  })

  it('both filters at once intersect rather than merge', () => {
    const both = library.filter((x) =>
      matchesFilters(x, { ...defaultFilters(), intensity: [5], darkness: [5] }),
    )
    expect(both).toHaveLength(0) // no book is 5 on both
  })
})

describe('sortBooks: unassessed last, by partition', () => {
  const sorted = sortBooks(library, 'darkness')

  it('orders assessed high to low, then every unassessed book', () => {
    const levels = sorted.map((x) => x.darkness)
    expect(levels.slice(0, 4)).toEqual([5, 4, 1, 0])
    expect(levels.slice(4).every((v) => v == null)).toBe(true)
  })

  it('drops nothing', () => {
    expect(new Set(sorted.map((x) => x.id)).size).toBe(library.length)
  })
})

describe('the level guides are real copy, one line per level 0..5', () => {
  it('both axes define all six levels, non-empty', () => {
    for (const guide of [SPICE_LEVEL_GUIDE, DARKNESS_LEVEL_GUIDE]) {
      expect(guide).toHaveLength(6)
      expect(guide.every((t) => t.trim().length > 0)).toBe(true)
    }
  })

  it('the two guides are different text — a shared guide would mean one axis, not two', () => {
    expect(SPICE_LEVEL_GUIDE).not.toEqual(DARKNESS_LEVEL_GUIDE)
  })
})
