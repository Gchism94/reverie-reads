import { describe, expect, it } from 'vitest'
import { legacyEntriesToMigrate, toDismissedMap } from './matchFeedback'

describe('match feedback — row mapping', () => {
  it('maps rows to the matcher map (bookId → epoch ms), skipping unparseable stamps', () => {
    const map = toDismissedMap([
      { book_id: 'a', at: '2026-07-01T00:00:00.000Z' },
      { book_id: 'b', at: 'not a date' },
    ])
    expect(map.a).toBe(Date.parse('2026-07-01T00:00:00.000Z'))
    expect(map.b).toBeUndefined()
  })
})

describe('match feedback — legacy localStorage migration', () => {
  const library = new Set(['a', 'b', 'c'])

  it('pushes only entries still in the library and not already on the server', () => {
    const raw = JSON.stringify({ a: 1000, b: 2000, gone: 3000 })
    const entries = legacyEntriesToMigrate(raw, { b: 500 }, library)
    // 'a' migrates; 'b' already server-recorded; 'gone' left the library
    expect(entries).toEqual([{ bookId: 'a', at: 1000 }])
  })

  it('preserves the original epoch stamps (the 60-day decay window keeps its meaning)', () => {
    const at = Date.parse('2026-06-01T12:00:00.000Z')
    const entries = legacyEntriesToMigrate(JSON.stringify({ c: at }), {}, library)
    expect(entries).toEqual([{ bookId: 'c', at }])
  })

  it('tolerates junk: null, malformed JSON, non-numeric stamps', () => {
    expect(legacyEntriesToMigrate(null, {}, library)).toEqual([])
    expect(legacyEntriesToMigrate('{oops', {}, library)).toEqual([])
    expect(legacyEntriesToMigrate('"a string"', {}, library)).toEqual([])
    expect(legacyEntriesToMigrate(JSON.stringify({ a: 'soon', b: null }), {}, library)).toEqual([])
  })
})
