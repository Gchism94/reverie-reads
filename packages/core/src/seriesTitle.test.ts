import { describe, expect, it } from 'vitest'
import { parseSeriesFromTitle } from './seriesTitle'

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
