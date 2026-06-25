import type { Book } from './types'

// Genre-agnostic "vibe matcher" scoring. Drives off generic signals — subgenre/genre weights,
// wanted tags, target intensity, the reader's own rating, and read state — NOT romance-coded
// tropes. A skin may add its own signature signal (Reverie passes the book-boyfriend archetype)
// via the optional archetype hook, but the core scoring is neutral and works for any genre.

export interface MatchProfile {
  /** weight per subgenre/genre name the reader leaned toward in the quiz */
  subWeights: Record<string, number>
  /** tags the reader is craving (matched against book.tags) */
  wantTags: string[]
  /** desired intensity 0..5, or null for no preference */
  targetIntensity: number | null
  /** optional skin-specific signature weights, keyed by whatever `archetype(book)` returns */
  archetypeWeights?: Record<string, number>
}

export interface MatchOptions {
  /** optional skin signature: maps a book to an archetype key scored via archetypeWeights */
  archetype?: (b: Book) => string
}

/** Score one book against a reader profile. Higher = better match. Pure + deterministic. */
export function scoreMatch(b: Book, p: MatchProfile, opts: MatchOptions = {}): number {
  let s = (p.subWeights[b.subgenre] ?? p.subWeights[b.genre] ?? 0) * 6

  const shared = p.wantTags.filter((t) => b.tags.includes(t)).length
  s += shared * 14

  if (p.targetIntensity != null) {
    // Unknown intensity is treated as neutral (no penalty) rather than guessed from genre.
    const bi = b.intensity ?? p.targetIntensity
    s -= Math.abs(bi - p.targetIntensity) * 4
  }

  if (opts.archetype && p.archetypeWeights) {
    s += (p.archetypeWeights[opts.archetype(b)] ?? 0) * 2
  }

  s += b.rating * 2
  const isRead = b.readStatus === 'Read' || b.reads.length > 0
  s += isRead ? -4 : 20
  return s
}
