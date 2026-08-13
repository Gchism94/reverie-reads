import { buildMatchContext, scoreMatch, type Book } from '@reverie/core'
import { describe, expect, it } from 'vitest'
import { applyAnswer, buildQuizProfile, emptyAnswers, QUIZ, type QuizAnswers } from './quiz'

// De-romancing the Match quiz (docs/archive/task-match-deromance.md): the acceptance test that matters is
// that a non-romance answer against a MIXED library surfaces the non-romance genre, and a romance
// answer still surfaces romance. We fold the real quiz options through applyAnswer, build the
// profile the Match route builds, and score a mixed library with the real core matcher.

/** Minimal Book for these tests — only the fields the matcher reads. */
function book(over: Partial<Book> & { id: string; genre: string; subgenre: string }): Book {
  return {
    title: over.id,
    first: '',
    last: '',
    contributors: [],
    series: '',
    position: '',
    seriesCount: null,
    status: 'standalone',
    genres: [over.genre],
    subgenres: [over.subgenre],
    tags: [],
    tropes: [],
    moods: [],
    intensity: 3,
    cover: '',
    isbn: '',
    fave: false,
    ownership: 'owned',
    owned: { physical: true, ebook: false, audiobook: false },
    format: 'Paperback',
    rating: 0,
    readStatus: 'Unread',
    source: 'Owned',
    pub: { y: null, m: null, d: null },
    reads: [],
    plan: null,
    progress: 0,
    addedTs: 0,
    ...over,
  } as Book
}

// A genuinely mixed library — romance, horror, literary, cozy — none read/rated, so the quiz's lean
// (not a pre-learned romance taste) decides the ranking.
const LIBRARY: Book[] = [
  book({
    id: 'romance-1',
    genre: 'romance',
    subgenre: 'Romance',
    tags: ['Enemies to Lovers', 'Slow Burn'],
    intensity: 2,
  }),
  book({
    id: 'romance-2',
    genre: 'romance',
    subgenre: 'Dark Romance',
    tags: ['Slow Burn'],
    intensity: 3,
  }),
  book({
    id: 'horror-1',
    genre: 'horror',
    subgenre: 'Cosmic Horror',
    tags: ['Unreliable Narrator', 'Twist Ending'],
    intensity: 4,
  }),
  book({
    id: 'horror-2',
    genre: 'horror',
    subgenre: 'Gothic',
    tags: ['Haunted House'],
    intensity: 4,
  }),
  book({
    id: 'literary-1',
    genre: 'literary',
    subgenre: 'Literary Fiction',
    tags: ['Grief & Memory'],
    intensity: 2,
  }),
  book({
    id: 'cozy-1',
    genre: 'cozy',
    subgenre: 'Small Town',
    tags: ['Slice of Life'],
    intensity: 1,
  }),
]

/** Fold a set of per-question option choices through the real quiz. */
function answer(choices: number[]): QuizAnswers {
  return choices.reduce(
    (a, optIndex, q) => applyAnswer(a, QUIZ[q]!.opts[optIndex]!),
    emptyAnswers(),
  )
}

/** Top-ranked book id for a given set of answers over the mixed library. */
function topPick(a: QuizAnswers): string {
  const ctx = buildMatchContext(LIBRARY, { now: 0 })
  const profile = buildQuizProfile(a)
  return LIBRARY.map((b) => ({ id: b.id, s: scoreMatch(b, profile, ctx).score })).sort(
    (x, y) => y.s - x.s,
  )[0]!.id
}

/** The genre key with the strongest accumulated lean. */
function topGenre(a: QuizAnswers): string {
  return Object.entries(a.genres).sort((x, y) => y[1] - x[1])[0]![0]
}

describe('quiz answers accumulate genre lean, intensity and cravings', () => {
  it('a dark/horror path leans horror, not Dark Romance', () => {
    // "Dark, eerie & unsettling" → "Dark & heavy" → "Fast" → "Twists & the unreliable" → "Thrilled"
    const a = answer([1, 3, 2, 3, 0])
    expect(a.genres.horror).toBeGreaterThan(0)
    // no romance subgenre gets silently injected (the old flow forced Dark Romance on any "dark" pick)
    expect(a.genres['Dark Romance']).toBeUndefined()
    expect(topGenre(a)).toBe('horror')
    expect(a.tropes).toContain('Unreliable Narrator')
  })

  it('a romance path leans romance', () => {
    // "Romance at the center" → "A little tension" → "Slow and simmering" → "Enemies" → "Warm"
    const a = answer([5, 1, 0, 0, 2])
    expect(topGenre(a)).toBe('romance')
    expect(a.tropes).toContain('Slow Burn')
  })
})

describe('buildQuizProfile is genre-neutral', () => {
  it('maps the averaged intensity through, null when never asked', () => {
    expect(buildQuizProfile(answer([1, 4, 2, 3, 0])).targetIntensity).toBeGreaterThanOrEqual(4)
    expect(buildQuizProfile(emptyAnswers()).targetIntensity).toBeNull()
  })
})

describe('a non-romance answer surfaces non-romance against a mixed library', () => {
  it('horror-intent answers top with a horror book, not romance', () => {
    expect(topPick(answer([1, 3, 2, 3, 0]))).toMatch(/^horror-/)
  })

  it('literary-intent answers top with the literary book', () => {
    // "Thoughtful & true to life" → "A little tension" → "steady" → "Found family" → "Moved & reflective"
    expect(topPick(answer([4, 1, 1, 1, 3]))).toMatch(/^literary-/)
  })

  it('romance-intent answers still top with a romance book (no regression)', () => {
    expect(topPick(answer([5, 1, 0, 0, 2]))).toMatch(/^romance-/)
  })
})
