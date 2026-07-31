import { describe, expect, it } from 'vitest'
import {
  emptyDate,
  formatPartialDate,
  hasDate,
  planDateForWrite,
  planFromDateString,
} from './partialDate'

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

describe('planDateForWrite — the lossless-only dual-write rule', () => {
  it('writes a plan_date only for a complete y+m+d, zero-padded', () => {
    expect(planDateForWrite({ y: 2026, m: 3, d: 14 })).toBe('2026-03-14')
    expect(planDateForWrite({ y: 2027, m: 12, d: 5 })).toBe('2027-12-05')
  })

  // THE RULE, AND THE MUTATION TARGET. An implementation that fabricated the missing parts — the
  // obvious "helpful" version, `${y}-${m ?? 1}-${d ?? 1}` — returns '2026-03-01' here and fails.
  // That is the whole point: a rolled-back app reading plan_date cannot distinguish a fabricated
  // first-of-month from a day the reader chose, and would render the invention as fact.
  it('a month-only plan writes NULL, not a fabricated first-of-month', () => {
    expect(planDateForWrite({ y: 2026, m: 3, d: null })).toBeNull()
  })

  it('a year-only plan writes NULL, not a fabricated January 1st', () => {
    expect(planDateForWrite({ y: 2026, m: null, d: null })).toBeNull()
  })

  it('an empty plan writes NULL', () => {
    expect(planDateForWrite(emptyDate())).toBeNull()
    expect(planDateForWrite(null)).toBeNull()
  })

  it('a day without a month is incomplete too — no plan_date is honest about it', () => {
    expect(planDateForWrite({ y: 2026, m: null, d: 14 })).toBeNull()
  })
})

describe('planFromDateString — reading rows written before the app moved', () => {
  it('parses a stored plan_date into the trio', () => {
    expect(planFromDateString('2026-03-14')).toEqual({ y: 2026, m: 3, d: 14 })
  })

  it('tolerates a full timestamp, taking the date part', () => {
    expect(planFromDateString('2026-03-14T00:00:00Z')).toEqual({ y: 2026, m: 3, d: 14 })
  })

  it('nothing in, empty date out — never a partially-filled guess', () => {
    expect(planFromDateString(null)).toEqual(emptyDate())
    expect(planFromDateString('')).toEqual(emptyDate())
    expect(planFromDateString('not a date')).toEqual(emptyDate())
  })

  it('round-trips a full date through planDateForWrite', () => {
    expect(planDateForWrite(planFromDateString('2026-03-14'))).toBe('2026-03-14')
  })
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
