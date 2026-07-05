import type { Book } from './types'
import { isBookRead } from './filters'

// Tier 1 of the matching roadmap (owner-approved): the LEARNED taste profile. The Tier-0 matcher
// scored against a one-shot quiz; this learns a standing baseline from the richest signal the app
// owns — the reader's own library verdicts. Ratings, rereads, faves, and DNFs become per-tag and
// per-world affinities; the quiz becomes a MOOD OVERRIDE on top of a learned floor, and Match can
// run with no quiz at all ("match my taste").
//
// Relationship to adaptive.ts: that module learns taste → SKIN weights (which room the app wears);
// this one learns taste → BOOK affinities (what to recommend). Same philosophy — the library is
// the profile — different granularity, so they stay separate modules.
//
// Pure + deterministic: `now` is injected (tests and the offline eval pass a fixed clock).

export interface TasteProfile {
  /** lowercased tag → affinity in -1..1 (support-damped, recency-weighted) */
  tagAffinity: Record<string, number>
  /** subgenre/genre (as stored on books) → affinity in -1..1 */
  subAffinity: Record<string, number>
  /** the reader's BASELINE verdict (-1..1, recency-weighted mean) — the prior for books that carry
   *  no evidence. Anchoring unknowns at a fixed 0.5 made every tagged book in a mostly-positive
   *  library beat every untagged one (the offline eval caught this measuring WORSE than random on
   *  the real seed); anchoring at the reader's own mean removes that systematic bias. */
  baseline: number
  /** how many books contributed any signal (0 = cold start; consumers treat taste as absent) */
  signalCount: number
}

const DAY = 86_400_000
/** Recency half-life: a verdict from two years ago counts half of one from today. */
const HALF_LIFE_DAYS = 730

/** The reader's verdict on a book, -1..1, or null when the book carries no signal (unread). */
export function bookVerdict(b: Book): number | null {
  if (b.readStatus === 'DNF') return -1
  const read = isBookRead(b)
  if (!read && !b.fave) return null
  // rating is the backbone (5★ → +1, 3★ → 0, 1★ → -1); an unrated finish is a mild positive
  let v = b.rating > 0 ? (b.rating - 3) / 2 : 0.2
  if (b.fave) v += 0.4
  if (b.reads.length >= 2) v += 0.3 // rereads are the strongest love signal a library records
  return Math.max(-1, Math.min(1, v))
}

/** Recency weight from the LAST logged read date (no dated reads → a mid weight, never zero). */
function recencyWeight(b: Book, now: number): number {
  let last: number | null = null
  for (const r of b.reads) {
    const t = Date.parse(r.date)
    if (!Number.isNaN(t)) last = last == null ? t : Math.max(last, t)
  }
  if (last == null) return 0.6
  const days = Math.max(0, (now - last) / DAY)
  return Math.max(0.15, Math.pow(0.5, days / HALF_LIFE_DAYS))
}

interface Acc {
  sum: number
  weight: number
  support: number
}

const accumulate = (map: Map<string, Acc>, key: string, v: number, w: number) => {
  const a = map.get(key) ?? { sum: 0, weight: 0, support: 0 }
  a.sum += v * w
  a.weight += w
  a.support += 1
  map.set(key, a)
}

/** support-damped weighted mean: a single-book tag only speaks at half strength */
const settle = (map: Map<string, Acc>): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const [k, a] of map) {
    if (a.weight <= 0) continue
    out[k] = (a.sum / a.weight) * Math.min(1, a.support / 2)
  }
  return out
}

/** Learn the standing taste profile from the library. O(books × tags), cheap enough per render. */
export function buildTasteProfile(books: readonly Book[], opts: { now?: number } = {}): TasteProfile {
  const now = opts.now ?? Date.now()
  const tags = new Map<string, Acc>()
  const subs = new Map<string, Acc>()
  let signalCount = 0
  let verdictSum = 0
  let verdictWeight = 0

  for (const b of books) {
    const v = bookVerdict(b)
    if (v == null) continue
    signalCount++
    const w = recencyWeight(b, now)
    verdictSum += v * w
    verdictWeight += w
    for (const t of new Set(b.tags.map((x) => x.toLowerCase()))) accumulate(tags, t, v, w)
    if (b.subgenre) accumulate(subs, b.subgenre, v, w)
    if (b.genre && b.genre !== b.subgenre) accumulate(subs, b.genre, v, w)
  }

  return {
    tagAffinity: settle(tags),
    subAffinity: settle(subs),
    baseline: verdictWeight ? verdictSum / verdictWeight : 0,
    signalCount,
  }
}

/** The book's content fit against a learned profile, 0..1 (0.5 = no evidence either way).
 *  Exposed for the matcher's taste components AND the offline eval, so both measure the same
 *  thing. `lovedTags` returns the book's tags the reader demonstrably loves (for the why-line). */
export function tasteFit(
  b: Book,
  taste: TasteProfile,
): { tagFit: number; worldFit: number; lovedTags: string[] } {
  if (!taste.signalCount) return { tagFit: 0.5, worldFit: 0.5, lovedTags: [] }
  const prior = (taste.baseline + 1) / 2

  // EVIDENCE-WEIGHTED mean (each tag weighted by |affinity|): a couple of strong loves aren't
  // diluted away by co-tags the reader is lukewarm on. Near-zero-affinity tags barely speak.
  let sum = 0
  let evidence = 0
  let n = 0
  const lovedTags: string[] = []
  for (const t of b.tags) {
    const a = taste.tagAffinity[t.toLowerCase()]
    if (a == null) continue
    const e = Math.abs(a)
    sum += a * e
    evidence += e
    n++
    if (a >= 0.3) lovedTags.push(t)
  }
  // confidence-blend toward the reader's prior: little evidence → mostly prior, never a free 0.5
  const conf = n / (n + 2)
  const evidenceFit = evidence > 0 ? (sum / evidence + 1) / 2 : prior
  const tagFit = conf * evidenceFit + (1 - conf) * prior

  const worldA = taste.subAffinity[b.subgenre] ?? taste.subAffinity[b.genre]
  const worldFit = worldA == null ? prior : (worldA + 1) / 2

  return { tagFit, worldFit, lovedTags }
}
