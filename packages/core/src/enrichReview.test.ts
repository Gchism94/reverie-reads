import { describe, expect, it } from 'vitest'
import {
  buildReviewModel,
  buildReviewModelFromImport,
  type CoverAlternate,
  type ImportItemOutcome,
  type ReviewItemInput,
} from './enrichReview'
import type { Book } from './types'

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

  it('buckets a broken cover distinctly from missing (had one, link is dead)', () => {
    const m = buildReviewModel([mk({ ref: '1', cover: 'dead.jpg', coverConfidence: 'high', coverBroken: true, coverAlternates: [ALT] })])
    expect(m.needsLook.brokenCover).toHaveLength(1)
    expect(m.needsLook.missingCover).toHaveLength(0) // it HAS a cover (just dead) → not "missing"
    expect(m.needsLook.lowConfidenceCover).toHaveLength(0) // broken wins even over a low confidence
    expect(m.needsLook.brokenCover[0]?.alternates).toEqual([ALT])
  })

  it('cover states are mutually exclusive — a broken+low book lists once, in broken', () => {
    const m = buildReviewModel([mk({ ref: '1', cover: 'dead.jpg', coverConfidence: 'low', coverBroken: true })])
    expect(m.coverTriage).toHaveLength(1)
    expect(m.coverTriage[0]?.reason).toBe('broken_cover')
  })

  it('triage queue is missing, THEN low-confidence, THEN broken', () => {
    const m = buildReviewModel([
      mk({ ref: 'broken', cover: 'd.jpg', coverConfidence: 'high', coverBroken: true }),
      mk({ ref: 'low', cover: 'm.jpg', coverConfidence: 'low' }),
      mk({ ref: 'missing', cover: '', coverConfidence: 'none' }),
    ])
    expect(m.coverTriage.map((i) => i.reason)).toEqual(['missing_cover', 'low_confidence_cover', 'broken_cover'])
  })
})

const book = (over: Partial<Book>): Book => ({
  id: 'b',
  title: 'A Book',
  first: 'An',
  last: 'Author',
  contributors: [],
  series: '',
  position: '',
  seriesCount: null,
  status: 'Standalone',
  genre: 'romance',
  subgenre: '',
  genres: [],
  tags: [],
  intensity: null,
  cover: '',
  isbn: '',
  fave: false,
  owned: { physical: false, ebook: false, audiobook: false },
  format: '',
  rating: 0,
  readStatus: 'Unread',
  source: '',
  pub: { y: null, m: null, d: null },
  reads: [],
  plan: null,
  progress: 0,
  addedTs: 0,
  ...over,
})

describe('buildReviewModelFromImport — joins import outcomes with post-enrichment books', () => {
  it('pulls cover/confidence/series/genre from the book and import-only signals from the outcome', () => {
    const books: Book[] = [
      book({ id: '1', title: 'High', cover: 'a.jpg', coverConfidence: 'high', series: 'S', status: 'Series' }),
      book({ id: '2', title: 'Low', cover: 'b.jpg', coverConfidence: 'low' }),
      book({ id: '3', title: 'NoCover', cover: '' }),
      book({ id: '4', title: 'Trusted', cover: 'seed.jpg' }), // no coverConfidence → trusted
    ]
    const outcomes: ImportItemOutcome[] = [
      { bookId: '1', disposition: 'added' },
      { bookId: '2', disposition: 'added' },
      { bookId: '3', disposition: 'added' },
      { bookId: '4', disposition: 'added' },
    ]
    const m = buildReviewModelFromImport(outcomes, books, { readingOrdersBuilt: 1 })
    expect(m.summary).toMatchObject({ total: 4, added: 4, merged: 0, inSeries: 1, standalones: 3, readingOrdersBuilt: 1 })
    expect(m.needsLook.missingCover.map((i) => i.ref)).toEqual(['3'])
    expect(m.needsLook.lowConfidenceCover.map((i) => i.ref)).toEqual(['2'])
    expect(m.coverTriage).toHaveLength(2) // a trusted cover with no recorded confidence is NOT flagged
  })

  it('marks a merged row as a detected duplicate and counts it as deduped', () => {
    const m = buildReviewModelFromImport(
      [{ bookId: '1', disposition: 'merged', duplicateFlagged: true }],
      [book({ id: '1', cover: 'x.jpg', coverConfidence: 'high' })],
    )
    expect(m.summary.merged).toBe(1)
    expect(m.needsLook.likelyDuplicate).toHaveLength(1)
    expect(m.needsLook.likelyDuplicate[0]?.detail).toMatch(/flagged in the export and detected/)
  })

  it('flags an unmapped genre on a fresh add, but not on a merge (existing genre stands)', () => {
    const added = buildReviewModelFromImport(
      [{ bookId: '1', disposition: 'added', unmappedGenre: 'standalone' }],
      [book({ id: '1', cover: 'x.jpg', coverConfidence: 'high' })],
    )
    expect(added.needsLook.oddGenre).toHaveLength(1)
    const merged = buildReviewModelFromImport(
      [{ bookId: '1', disposition: 'merged', unmappedGenre: 'standalone' }],
      [book({ id: '1', cover: 'x.jpg', coverConfidence: 'high' })],
    )
    expect(merged.needsLook.oddGenre).toHaveLength(0)
  })

  it('skips outcomes whose book is missing', () => {
    const m = buildReviewModelFromImport([{ bookId: 'gone', disposition: 'added' }], [book({ id: '1' })])
    expect(m.summary.total).toBe(0)
  })

  it('routes a book in brokenRefs to the brokenCover bucket (runtime onerror signal)', () => {
    const m = buildReviewModelFromImport(
      [{ bookId: '1', disposition: 'added' }],
      [book({ id: '1', cover: 'dead.jpg', coverConfidence: 'high' })],
      { brokenRefs: new Set(['1']) },
    )
    expect(m.needsLook.brokenCover.map((i) => i.ref)).toEqual(['1'])
    expect(m.needsLook.missingCover).toHaveLength(0) // it has a cover (just dead)
    expect(m.coverTriage[0]?.reason).toBe('broken_cover')
  })
})
