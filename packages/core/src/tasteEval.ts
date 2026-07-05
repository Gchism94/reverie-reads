import type { Book } from './types'
import { isBookRead } from './filters'
import { buildTasteProfile, tasteFit } from './tasteProfile'

// Offline evaluation for the learned taste profile (Tier 1's "tune against data, not vibes").
// Leave-one-out over the reader's LOVED books: hide one, learn taste from the rest, and ask where
// the hidden book ranks — by content fit alone — among everything else. If taste is learning
// anything real, books the reader demonstrably loved should sit well above the middle of the pack.
// Pure + deterministic (fixed clock in), so it can run as a unit test against the real seed data
// and fail loudly if a matcher change quietly makes recommendations worse.

export interface TasteEvalResult {
  /** how many loved books were held out and scored */
  evaluated: number
  /** mean percentile of the held-out loved books (ties mid-ranked; 0.5 = no better than random) */
  meanPercentile: number
  /** fraction of held-out loved books ranking in the top 20% of the pool */
  recallAtTop20: number
  /** the subset whose held-out book carried tag evidence the profile knows — the only subset a
   *  content model can be judged on at the tag level (untagged books are unevaluable, not failed) */
  evaluatedTagged: number
  meanPercentileTagged: number
}

/** Content-only fit (no novelty/series/quiz) — the axis the taste profile is supposed to learn. */
const contentFit = (b: Book, taste: ReturnType<typeof buildTasteProfile>): number => {
  const f = tasteFit(b, taste)
  return 0.65 * f.tagFit + 0.35 * f.worldFit
}

export function evaluateTasteHoldout(
  books: readonly Book[],
  opts: { minRating?: number; now?: number } = {},
): TasteEvalResult {
  const minRating = opts.minRating ?? 4
  const now = opts.now ?? Date.now()
  const loved = books.filter((b) => isBookRead(b) && b.rating >= minRating)

  let evaluated = 0
  let percentileSum = 0
  let top20 = 0
  let evaluatedTagged = 0
  let percentileTaggedSum = 0

  for (const held of loved) {
    const rest = books.filter((b) => b.id !== held.id)
    const taste = buildTasteProfile(rest, { now })
    if (!taste.signalCount) continue

    // strip the held-out book's own verdict so it scores as a stranger
    const stranger: Book = { ...held, rating: 0, readStatus: 'Unread', reads: [], fave: false }
    const target = contentFit(stranger, taste)
    // ties are mid-ranked — with coarse evidence (three subgenres, sparse tags) most of the pool
    // ties, and counting ties as losses reads "indistinguishable" as "worse than random"
    let beaten = 0
    let tied = 0
    for (const other of rest) {
      const f = contentFit(other, taste)
      if (f < target - 1e-9) beaten++
      else if (Math.abs(f - target) <= 1e-9) tied++
    }
    const percentile = rest.length ? (beaten + 0.5 * tied) / rest.length : 0.5

    evaluated++
    percentileSum += percentile
    if (percentile >= 0.8) top20++
    const hasKnownTag = stranger.tags.some((t) => taste.tagAffinity[t.toLowerCase()] != null)
    if (hasKnownTag) {
      evaluatedTagged++
      percentileTaggedSum += percentile
    }
  }

  return {
    evaluated,
    meanPercentile: evaluated ? percentileSum / evaluated : 0,
    recallAtTop20: evaluated ? top20 / evaluated : 0,
    evaluatedTagged,
    meanPercentileTagged: evaluatedTagged ? percentileTaggedSum / evaluatedTagged : 0,
  }
}
