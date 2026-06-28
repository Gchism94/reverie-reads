import { describe, expect, it } from 'vitest'
import { buildReviewModel, type CoverAlternate, type ReviewItemInput } from './enrichReview'

const ALT: CoverAlternate = { source: 'google', cover: 'alt.jpg', isbn13: '9780000000009', title: 'X', author: 'Y' }

const base: ReviewItemInput = {
  ref: 'b',
  title: 'A Book',
  author: 'An Author',
  disposition: 'added',
  inSeries: false,
  cover: 'c.jpg',
  coverConfidence: 'high',
  genre: 'Romance',
}

const mk = (over: Partial<ReviewItemInput>): ReviewItemInput => ({ ...base, ...over })

describe('buildReviewModel — summary', () => {
  it('tallies totals, dispositions, series split, reading orders, and genre breakdown', () => {
    const m = buildReviewModel(
      [
        mk({ ref: '1', disposition: 'added', inSeries: true, genre: 'Romance' }),
        mk({ ref: '2', disposition: 'added', inSeries: true, genre: 'Fantasy' }),
        mk({ ref: '3', disposition: 'merged', inSeries: false, genre: 'Romance' }),
        mk({ ref: '4', disposition: 'added', inSeries: false, genre: null }), // unresolved → ∅
      ],
      { readingOrdersBuilt: 2 },
    )
    expect(m.summary).toMatchObject({ total: 4, added: 3, merged: 1, inSeries: 2, standalones: 2, readingOrdersBuilt: 2 })
    expect(m.summary.genres).toEqual({ Romance: 2, Fantasy: 1, '∅': 1 })
  })
})

describe('buildReviewModel — needs-a-look buckets', () => {
  it('buckets missing covers, and they lead the Cover Studio triage queue', () => {
    const m = buildReviewModel([mk({ ref: '1', cover: '', coverConfidence: 'none', coverAlternates: [ALT] })])
    expect(m.needsLook.missingCover).toHaveLength(1)
    expect(m.needsLook.missingCover[0]?.alternates).toEqual([ALT]) // alternates ride along for the picker
    expect(m.coverTriage[0]?.reason).toBe('missing_cover')
  })

  it('buckets a resolved-but-low-confidence cover separately (wrong-cover risk)', () => {
    const m = buildReviewModel([mk({ ref: '1', cover: 'maybe.jpg', coverConfidence: 'low', coverAlternates: [ALT] })])
    expect(m.needsLook.lowConfidenceCover).toHaveLength(1)
    expect(m.needsLook.missingCover).toHaveLength(0)
    expect(m.needsLook.lowConfidenceCover[0]?.alternates).toEqual([ALT])
  })

  it('a high-confidence cover is NOT flagged', () => {
    const m = buildReviewModel([mk({ cover: 'good.jpg', coverConfidence: 'high' })])
    expect(m.coverTriage).toHaveLength(0)
  })

  it('buckets unmapped/odd genres (the I1 leaked "standalone")', () => {
    const m = buildReviewModel([mk({ genre: null, unmappedGenre: 'standalone' })])
    expect(m.needsLook.oddGenre).toHaveLength(1)
    expect(m.needsLook.oddGenre[0]?.detail).toMatch(/standalone/)
    expect(m.needsLook.oddGenre[0]?.alternates).toEqual([]) // non-cover bucket: no alternates
  })

  it('buckets likely duplicates from either the export flag or detection', () => {
    const m = buildReviewModel([
      mk({ ref: '1', duplicateFlagged: true }),
      mk({ ref: '2', duplicateDetected: true }),
      mk({ ref: '3', duplicateFlagged: true, duplicateDetected: true }),
    ])
    expect(m.needsLook.likelyDuplicate).toHaveLength(3)
    expect(m.needsLook.likelyDuplicate[2]?.detail).toMatch(/flagged in the export and detected/)
  })

  it('one book can land in several buckets (missing cover AND odd genre)', () => {
    const m = buildReviewModel([mk({ ref: '1', cover: '', coverConfidence: 'none', genre: null, unmappedGenre: 'standalone' })])
    expect(m.needsLook.missingCover).toHaveLength(1)
    expect(m.needsLook.oddGenre).toHaveLength(1)
    expect(m.coverTriage).toHaveLength(1)
  })

  it('triage queue is missing covers THEN low-confidence covers', () => {
    const m = buildReviewModel([
      mk({ ref: 'low', cover: 'm.jpg', coverConfidence: 'low' }),
      mk({ ref: 'missing', cover: '', coverConfidence: 'none' }),
    ])
    expect(m.coverTriage.map((i) => i.reason)).toEqual(['missing_cover', 'low_confidence_cover'])
  })
})
