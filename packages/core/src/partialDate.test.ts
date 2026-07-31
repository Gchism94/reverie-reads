import { describe, expect, it } from 'vitest'
import { emptyDate, formatPartialDate, hasDate } from './partialDate'

describe('formatPartialDate — the two diverged fmtPub copies, reconciled', () => {
  it('renders at each of the three precisions, and empty when nothing is stated', () => {
    expect(formatPartialDate({ y: 2026, m: 3, d: 14 })).toBe('Mar 14, 2026')
    expect(formatPartialDate({ y: 2026, m: 3, d: null })).toBe('Mar 2026')
    expect(formatPartialDate({ y: 2026, m: null, d: null })).toBe('2026')
    expect(formatPartialDate(emptyDate())).toBe('')
  })

  it('a day without a month falls back to the year — a bare "14, 2026" would be nonsense', () => {
    expect(formatPartialDate({ y: 2026, m: null, d: 14 })).toBe('2026')
  })

  it('never renders anything without a year, since precision below it has no anchor', () => {
    expect(formatPartialDate({ y: null, m: 3, d: 14 })).toBe('')
    expect(formatPartialDate(null)).toBe('')
    expect(formatPartialDate(undefined)).toBe('')
  })

  // THE DIVERGENCE THIS FUNCTION EXISTS TO SETTLE. The two copies differed only on the month lookup:
  // BookDetailRoute guarded it (`MONTHS[p.m - 1] ?? ''`, rendering ' 2026'), PlannerRoute did not
  // (rendering 'undefined 2026'). Neither was kept — an out-of-range month drops to the year alone.
  // Unreachable through stored data (books_pub_m_check / books_plan_m_check bound it to 1..12), so
  // this pins behaviour for the input the database would have refused, which is the only input on
  // which the two copies ever disagreed.
  it.each([0, 13, 99, -1])(
    'an out-of-range month (%i) degrades to the year, never "undefined"',
    (m) => {
      const out = formatPartialDate({ y: 2026, m, d: 14 })
      expect(out).toBe('2026')
      expect(out).not.toContain('undefined')
      expect(out.startsWith(' ')).toBe(false)
    },
  )
})

describe('hasDate', () => {
  it('is anchored on the year — that is what makes a plan real', () => {
    expect(hasDate({ y: 2026, m: null, d: null })).toBe(true)
    expect(hasDate({ y: 2026, m: 3, d: 14 })).toBe(true)
    expect(hasDate(emptyDate())).toBe(false)
    // Stored happily by the schema, invisible to every reader of it. The plan editor refuses it.
    expect(hasDate({ y: null, m: 3, d: 14 })).toBe(false)
    expect(hasDate(null)).toBe(false)
  })
})
