import type { MatchProfile } from '@reverie/core'

// The Match quiz — a genre-neutral mood questionnaire (de-romanced, docs/archive/task-match-deromance.md).
//
// It was a romance-era artifact: romance-shaped options ("Sweeping fantasy & magic / Dark & intense
// / Cozy & heartfelt"), answer weights that only mapped onto romance subgenres, and a romance-only
// result vocabulary. Approach (a): keep the 5-question quiz, make its questions, weights and result
// vocabulary span all nine primary genres. The eventual north star is library-signal-driven Match
// (approach (b), logged in docs/decisions/0002-match-library-signal-north-star.md) — not built here.
//
// The weights are deliberately keyed off the LOWERCASED primary-genre keys (matching `book.genre`,
// the canonical CORE_GENRES key). The core matcher scores subgenre lean as
// `subWeights[book.subgenre] ?? subWeights[book.genre]`, so a genre-keyed weight steers every book
// in that genre through the fallback — a horror weight reaches a "Gothic" book, a "Cosmic Horror"
// book, and so on, without enumerating subgenres.

export interface QuizOption {
  t: string
  /** genre lean — keys are lowercased primary-genre keys (CORE_GENRES lowercased, matching
   *  `book.genre`); values accumulate into the match profile's subWeights. */
  genres?: Record<string, number>
  /**
   * Desired DARKNESS 1..5 on the 0..5 axis — how dark/heavy, not how hot.
   *
   * Repointed from `intensity` (owner ruling, 2026-08-21). The five options below were already
   * darkness language and were never rewritten; only the field they score changed. This is an
   * intentional behaviour change: an answer to "How intense do you want it?" now moves a book's
   * darkness match, not its spice match.
   */
  darkness?: number
  tropes?: string[]
  pace?: 'slow' | 'mid' | 'fast'
}

export interface QuizQuestion {
  q: string
  opts: QuizOption[]
}

export const QUIZ: QuizQuestion[] = [
  {
    q: 'What kind of story are you craving right now?',
    opts: [
      { t: 'Sweeping adventure & magic', genres: { fantasy: 3, 'science fiction': 1 } },
      { t: 'Dark, eerie & unsettling', genres: { horror: 3 } },
      { t: 'A mystery to unravel', genres: { mystery: 3 } },
      { t: 'Cozy & heartwarming', genres: { cozy: 3, romance: 1 } },
      { t: 'Thoughtful & true to life', genres: { literary: 3, nonfiction: 2 } },
      { t: 'Romance at the center', genres: { romance: 3, fantasy: 1 } },
    ],
  },
  {
    q: 'How intense do you want it?',
    opts: [
      { t: 'Gentle & comforting', darkness: 1 },
      { t: 'A little tension', darkness: 2 },
      { t: 'Properly gripping', darkness: 3 },
      { t: 'Dark & heavy', darkness: 4 },
      { t: 'As extreme as it gets', darkness: 5 },
    ],
  },
  {
    q: 'How should it unfold?',
    opts: [
      { t: 'Slow and simmering', tropes: ['Slow Burn'], pace: 'slow' },
      { t: 'A steady build', pace: 'mid' },
      { t: 'Fast and all-consuming', pace: 'fast' },
    ],
  },
  {
    q: 'What pulls you in?',
    opts: [
      { t: 'Enemies, rivals & sharp edges', tropes: ['Enemies to Lovers'] },
      { t: 'Found family & fierce loyalty', tropes: ['Found Family'] },
      { t: 'A morally gray lead', tropes: ['Morally Gray', 'Anti-Hero'] },
      { t: 'Twists & the unreliable', tropes: ['Unreliable Narrator', 'Twist Ending'] },
      { t: 'A chosen one & hidden power', tropes: ['Chosen One', 'Hidden Powers'] },
      { t: 'Second chances & redemption', tropes: ['Second Chance', 'Redemption Arc'] },
    ],
  },
  {
    q: 'How do you want to feel when you close it?',
    opts: [
      { t: 'Thrilled & on edge', genres: { horror: 1, mystery: 1, 'science fiction': 1 } },
      { t: 'Swept away & wonderstruck', genres: { fantasy: 1, romance: 1 } },
      { t: 'Warm & content', genres: { cozy: 1, romance: 1 } },
      { t: 'Moved & reflective', genres: { literary: 2, nonfiction: 1 } },
      { t: 'Wrecked, in the best way', tropes: ['Slow Burn'], darkness: 4 },
    ],
  },
]

// Intensity descriptors for the result pills. HEAT is the romance skin's spice vocabulary (shown
// only when the match is romance-leaning); INTENSITY is the genre-neutral word for everything else.
export const HEAT = ['', 'Sweet', 'Warm', 'Steamy', 'Scorching', 'Blistering']
export const INTENSITY = ['', 'Gentle', 'Mild', 'Intense', 'Dark', 'Harrowing']

export interface QuizAnswers {
  /** accumulated genre lean, keyed by lowercased primary-genre key */
  genres: Record<string, number>
  darknesses: number[]
  tropes: string[]
  pace: 'slow' | 'mid' | 'fast' | null
}

export const emptyAnswers = (): QuizAnswers => ({
  genres: {},
  darknesses: [],
  tropes: [],
  pace: null,
})

export function applyAnswer(a: QuizAnswers, o: QuizOption): QuizAnswers {
  const next: QuizAnswers = {
    genres: { ...a.genres },
    darknesses: [...a.darknesses],
    tropes: [...a.tropes],
    pace: o.pace ?? a.pace,
  }
  for (const [k, v] of Object.entries(o.genres ?? {})) next.genres[k] = (next.genres[k] ?? 0) + v
  if (o.tropes) next.tropes.push(...o.tropes)
  if (o.darkness) next.darknesses.push(o.darkness)
  return next
}

/** Translate the quiz answers into the core matcher's genre-neutral profile. The genre lean feeds
 *  subWeights (keyed off the lowercased primary-genre key, which the matcher resolves through
 *  `subWeights[book.subgenre] ?? subWeights[book.genre]`); cravings feed wantTags; the averaged
 *  darkness feeds targetDarkness (null = no preference). Pure — the same function the Match route
 *  and its tests share. */
export function buildQuizProfile(a: QuizAnswers): MatchProfile {
  const target = a.darknesses.length
    ? Math.round(a.darknesses.reduce((x, y) => x + y, 0) / a.darknesses.length)
    : null
  return { subWeights: { ...a.genres }, wantTags: [...new Set(a.tropes)], targetDarkness: target }
}
