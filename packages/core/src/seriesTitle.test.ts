import { describe, expect, it } from 'vitest'
import { parseSeriesFromTitle, planTitleCleanup } from './seriesTitle'
import { findDuplicateGroups } from './merge'
import { makeBook } from './book.fixture'

describe('parseSeriesFromTitle (Goodreads series-in-title)', () => {
  it('parses the canonical form', () => {
    expect(parseSeriesFromTitle('A Court of Thorns and Roses (ACOTAR, #1)')).toEqual({
      title: 'A Court of Thorns and Roses',
      series: 'ACOTAR',
      position: 1,
      more: [],
    })
  })

  it('parses fractional positions (#2.5 novellas)', () => {
    const p = parseSeriesFromTitle('A Court of Frost and Starlight (ACOTAR, #3.5)')
    expect(p.series).toBe('ACOTAR')
    expect(p.position).toBe(3.5)
  })

  it('parses without the comma and with "Book N"', () => {
    expect(parseSeriesFromTitle('Iron Flame (The Empyrean #2)').position).toBe(2)
    expect(parseSeriesFromTitle('Iron Flame (The Empyrean, Book 2)')).toMatchObject({
      series: 'The Empyrean',
      position: 2,
    })
  })

  it('keeps the series but no single position for #1-3 omnibus ranges', () => {
    const p = parseSeriesFromTitle('The Complete Trilogy (Shatter Me, #1-3)')
    expect(p.title).toBe('The Complete Trilogy')
    expect(p.series).toBe('Shatter Me')
    expect(p.position).toBe('')
  })

  it('handles multiple series — stacked parens and ;-separated', () => {
    const stacked = parseSeriesFromTitle('Crossover Book (Series A, #2) (Crossover Saga, #1)')
    expect(stacked.title).toBe('Crossover Book')
    expect(stacked.series).toBe('Series A')
    expect(stacked.more).toEqual([{ series: 'Crossover Saga', position: 1 }])

    const joined = parseSeriesFromTitle('Crossover Book (Series A, #2; Crossover Saga, #1)')
    expect(joined.series).toBe('Series A')
    expect(joined.more).toEqual([{ series: 'Crossover Saga', position: 1 }])
  })

  it('never consumes non-series parentheticals', () => {
    expect(parseSeriesFromTitle('Powerless (Deluxe Edition)')).toEqual({
      title: 'Powerless (Deluxe Edition)',
      series: '',
      position: '',
      more: [],
    })
    // a mid-title paren behind a series paren stays put
    const p = parseSeriesFromTitle('It Ends (Not a Drill) (Checkmate, #4)')
    expect(p.title).toBe('It Ends (Not a Drill)')
    expect(p.series).toBe('Checkmate')
  })

  it('passes plain titles through untouched', () => {
    expect(parseSeriesFromTitle('It Ends with Us')).toEqual({ title: 'It Ends with Us', series: '', position: '', more: [] })
    expect(parseSeriesFromTitle('')).toEqual({ title: '', series: '', position: '', more: [] })
  })
})

describe('planTitleCleanup (legacy re-parse sweep)', () => {
  it('cleans the title and fills series/position only when the book has none', () => {
    const plan = planTitleCleanup([
      makeBook({ id: '1', title: 'Iron Flame (The Empyrean, #2)' }), // no series → fill
    ])
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({
      id: '1',
      oldTitle: 'Iron Flame (The Empyrean, #2)',
      newTitle: 'Iron Flame',
      series: 'The Empyrean',
      position: 2,
      fillsSeries: true,
    })
  })

  it('never overwrites user-entered series info — cleans the title only', () => {
    const plan = planTitleCleanup([
      makeBook({ id: '1', title: 'Iron Flame (The Empyrean, #2)', series: 'My Own Series', position: 5 }),
    ])
    expect(plan[0]).toMatchObject({ newTitle: 'Iron Flame', series: '', position: '', fillsSeries: false })
  })

  it('leaves clean titles and non-series parentheticals alone', () => {
    const plan = planTitleCleanup([
      makeBook({ id: '1', title: 'It Ends with Us' }),
      makeBook({ id: '2', title: 'Powerless (Deluxe Edition)' }),
      makeBook({ id: '3', title: 'The Hacienda (Unabridged)' }),
    ])
    expect(plan).toHaveLength(0)
  })

  it('is idempotent — re-running over a cleaned library finds nothing', () => {
    const first = planTitleCleanup([makeBook({ id: '1', title: 'Iron Flame (The Empyrean, #2)' })])
    const cleaned = makeBook({ id: '1', title: first[0]!.newTitle, series: first[0]!.series, position: first[0]!.position })
    expect(planTitleCleanup([cleaned])).toHaveLength(0)
  })

  // Part 4: cleaning the junk lets the detector catch pairs it previously missed. A dirty Goodreads
  // title and its clean twin don't share a dupKey until the junk is stripped.
  it('cleaning junk titles reveals duplicates the matcher missed (before/after)', () => {
    const library = [
      makeBook({ id: 'dirty', title: 'Fourth Wing (The Empyrean, #1)', last: 'Yarros' }),
      makeBook({ id: 'clean', title: 'Fourth Wing', last: 'Yarros' }),
    ]
    // Before: different titles → no duplicate group detected.
    expect(findDuplicateGroups(library)).toHaveLength(0)

    // Apply the sweep's planned new titles, then re-detect.
    const plan = planTitleCleanup(library)
    const swept = library.map((b) => {
      const c = plan.find((p) => p.id === b.id)
      return c ? makeBook({ ...b, title: c.newTitle }) : b
    })
    expect(findDuplicateGroups(swept)).toHaveLength(1) // now they collide → mergeable
    expect(findDuplicateGroups(swept)[0]).toHaveLength(2)
  })
})
