import { describe, expect, it } from 'vitest'
import { makeSeriesClaim, normalizeSeriesClaim } from './seriesClaim'

describe('series claim provenance', () => {
  it('fails closed for missing, malformed, or unknown origins', () => {
    expect(normalizeSeriesClaim(undefined)).toEqual({ origin: 'unknown' })
    expect(normalizeSeriesClaim([])).toEqual({ origin: 'unknown' })
    expect(normalizeSeriesClaim({ origin: 'catalog_guess' })).toEqual({ origin: 'unknown' })
  })

  it('retains only the typed optional fields', () => {
    expect(
      normalizeSeriesClaim({
        origin: 'import',
        source: ' series_column ',
        sourceRef: ' row-17 ',
        confidence: 'high',
        at: '2026-08-30T12:00:00.000Z',
        ignored: 'not part of the contract',
      }),
    ).toEqual({
      origin: 'import',
      source: 'series_column',
      sourceRef: 'row-17',
      confidence: 'high',
      at: '2026-08-30T12:00:00.000Z',
    })
  })

  it('builds an explicit reader claim without inventing optional fields', () => {
    expect(makeSeriesClaim('reader', 'book_edit', { at: '2026-08-30T12:00:00.000Z' })).toEqual({
      origin: 'reader',
      source: 'book_edit',
      at: '2026-08-30T12:00:00.000Z',
    })
  })
})
