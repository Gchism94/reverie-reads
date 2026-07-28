import { describe, expect, it } from 'vitest'
import { countTruncatedIsbns, isLikelyTruncatedIsbn } from './isbnNotice'

describe('isLikelyTruncatedIsbn', () => {
  it('flags all-digit values of length 8–9 (truncated ISBN-10)', () => {
    expect(isLikelyTruncatedIsbn('43970818')).toBe(true) // 8
    expect(isLikelyTruncatedIsbn('439708180')).toBe(true) // 9 — the 0439708180-lost-its-zero case
  })
  it('flags all-digit values of length 11–12 (truncated ISBN-13)', () => {
    expect(isLikelyTruncatedIsbn('97816493741')).toBe(true) // 11
    expect(isLikelyTruncatedIsbn('978164937417')).toBe(true) // 12
  })
  it('does NOT flag a valid ISBN-10 (incl. a trailing X) or a valid ISBN-13', () => {
    expect(isLikelyTruncatedIsbn('0439708180')).toBe(false) // valid 10
    expect(isLikelyTruncatedIsbn('080442957X')).toBe(false) // valid 10 with X
    expect(isLikelyTruncatedIsbn('9781649374172')).toBe(false) // valid 13
  })
  it('does NOT flag hyphenated / spaced valid ISBNs (normalized first)', () => {
    expect(isLikelyTruncatedIsbn('978-1-649-37417-2')).toBe(false)
    expect(isLikelyTruncatedIsbn('0-439-70818-0')).toBe(false)
    expect(isLikelyTruncatedIsbn('0 8044 2957 X')).toBe(false)
  })
  it('does NOT flag empty or non-numeric junk', () => {
    expect(isLikelyTruncatedIsbn('')).toBe(false)
    expect(isLikelyTruncatedIsbn('   ')).toBe(false)
    expect(isLikelyTruncatedIsbn('n/a')).toBe(false)
    expect(isLikelyTruncatedIsbn('not-an-isbn')).toBe(false)
    expect(isLikelyTruncatedIsbn('12X45678')).toBe(false) // 8 chars but non-numeric → junk, not truncation
  })
})

describe('countTruncatedIsbns', () => {
  const rows = [
    ['Title', 'ISBN', 'ISBN13', 'Pages'],
    ['Holes', '439708180', '9781649374172', '233'], // truncated ISBN-10 (the 0 fell off)
    ['Iron Flame', '1649374178', '9781649374172', '12345678'], // valid 10; Pages is an 8-digit number
    ['Fourth Wing', '', '', ''], // empty — not counted
  ]

  it('counts truncated ISBNs only in ISBN columns', () => {
    expect(countTruncatedIsbns(rows)).toBe(1) // the lone 439708180
  })

  it('never scans non-ISBN columns (an 8-digit Pages value is ignored)', () => {
    // If Pages were scanned, "12345678" would add a false positive — it must not.
    expect(countTruncatedIsbns(rows)).toBe(1)
  })

  it('returns 0 when there is no ISBN column, or no data rows', () => {
    expect(
      countTruncatedIsbns([
        ['Title', 'Author'],
        ['A', 'B'],
      ]),
    ).toBe(0)
    expect(countTruncatedIsbns([['Title', 'ISBN']])).toBe(0)
    expect(countTruncatedIsbns([])).toBe(0)
  })

  it('is read-only — the input rows are untouched', () => {
    const snapshot = JSON.parse(JSON.stringify(rows))
    countTruncatedIsbns(rows)
    expect(rows).toEqual(snapshot)
  })
})
