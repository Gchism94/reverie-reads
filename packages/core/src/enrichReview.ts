// E3 — import/enrichment review read-model (docs/COVER_SOURCING_AND_STUDIO.md; docs/IMPORT_REAL_VALIDATION.md).
// After an import + background enrichment run, the onboarding/import REVIEW screen and the Cover Studio
// need a structured "what happened / what needs a look" payload. This builds it PURELY from per-book
// outcomes the caller assembled during the run — a summary plus the bucketed "needs a look" items, each
// carrying enough to act on (and, for covers, the E1 alternate candidates the picker offers). The Cover
// Studio's triage queue is exactly the missing + low-confidence cover buckets. Pure shape, unit-tested;
// the UI (review screen + Cover Studio) is built later and consumes this.

import { confidenceRank, type Confidence } from './enrichResolve'
import type { EnrichSource } from './enrich'
import type { Book } from './types'
import { authorOf } from './normalize'

/** A cover edition choice for the picker (distilled from an E1 alternate candidate). */
export interface CoverAlternate {
  source: EnrichSource
  cover: string
  isbn13: string
  title: string
  author: string
}

/** One book's outcome after import + enrichment, as the caller observed it. */
export interface ReviewItemInput {
  ref: string
  title: string
  author: string
  /** import disposition: a fresh add, or deduped (merged) into an existing book */
  disposition: 'added' | 'merged'
  inSeries: boolean
  /** the resolved cover URL, or null/'' when none was found */
  cover?: string | null
  /** confidence of the cover/match (E1); 'none' when nothing resolved */
  coverConfidence: Confidence
  /** the saved cover exists but its link is dead (client onerror at runtime) — distinct from missing */
  coverBroken?: boolean
  /** edition choices for this book (E1 alternates) — drives the cover picker */
  coverAlternates?: CoverAlternate[]
  /** the mapped primary genre, or null when unresolved */
  genre?: string | null
  /** the raw genre token when it did NOT map to a known genre (I1: a leaked "standalone", odd label) */
  unmappedGenre?: string | null
  /** the source export flagged this row as a known duplicate */
  duplicateFlagged?: boolean
  /** the matcher detected this as a likely duplicate of an existing book */
  duplicateDetected?: boolean
}

export interface ReviewSummary {
  total: number
  added: number
  /** deduped into an existing book */
  merged: number
  inSeries: number
  standalones: number
  readingOrdersBuilt: number
  /** primary-genre breakdown; unresolved genres tallied under '∅' */
  genres: Record<string, number>
}

export type NeedsLookReason = 'missing_cover' | 'low_confidence_cover' | 'broken_cover' | 'odd_genre' | 'likely_duplicate'

export interface NeedsLookItem {
  ref: string
  title: string
  author: string
  reason: NeedsLookReason
  detail: string
  /** cover edition choices — populated for the cover buckets, empty otherwise */
  alternates: CoverAlternate[]
}

export interface ReviewModel {
  summary: ReviewSummary
  needsLook: {
    missingCover: NeedsLookItem[]
    lowConfidenceCover: NeedsLookItem[]
    /** had a cover, but the link is dead (runtime onerror) — distinct from never-resolved */
    brokenCover: NeedsLookItem[]
    oddGenre: NeedsLookItem[]
    likelyDuplicate: NeedsLookItem[]
  }
  /** the Cover Studio "needs attention" queue: missing, then low-confidence, then broken covers */
  coverTriage: NeedsLookItem[]
}

const hasCover = (i: ReviewItemInput): boolean => !!(i.cover && i.cover.trim())
// A resolved cover whose match wasn't safe (low/none) — wrong-cover risk, surface for a look.
const isLowConfidenceCover = (i: ReviewItemInput): boolean =>
  hasCover(i) && confidenceRank(i.coverConfidence) <= confidenceRank('low')

const item = (i: ReviewItemInput, reason: NeedsLookReason, detail: string): NeedsLookItem => ({
  ref: i.ref,
  title: i.title,
  author: i.author,
  reason,
  detail,
  alternates: reason === 'missing_cover' || reason === 'low_confidence_cover' || reason === 'broken_cover' ? (i.coverAlternates ?? []) : [],
})

/**
 * Build the review payload from per-book outcomes. The three COVER states (broken / missing / low-
 * confidence) are mutually exclusive so the triage queue never double-lists a book; the other buckets
 * (odd genre, likely duplicate) are independent views a book can also appear in. The Cover Studio
 * "needs attention" queue is missing + low-confidence + broken, each carrying its alternate editions.
 */
export function buildReviewModel(
  items: readonly ReviewItemInput[],
  opts: { readingOrdersBuilt?: number } = {},
): ReviewModel {
  const summary: ReviewSummary = {
    total: items.length,
    added: 0,
    merged: 0,
    inSeries: 0,
    standalones: 0,
    readingOrdersBuilt: opts.readingOrdersBuilt ?? 0,
    genres: {},
  }
  const missingCover: NeedsLookItem[] = []
  const lowConfidenceCover: NeedsLookItem[] = []
  const brokenCover: NeedsLookItem[] = []
  const oddGenre: NeedsLookItem[] = []
  const likelyDuplicate: NeedsLookItem[] = []

  for (const i of items) {
    if (i.disposition === 'merged') summary.merged++
    else summary.added++
    if (i.inSeries) summary.inSeries++
    else summary.standalones++

    const g = i.genre && i.genre.trim() ? i.genre : '∅'
    summary.genres[g] = (summary.genres[g] ?? 0) + 1

    // Cover state is one-of (mutually exclusive so the triage queue never double-lists a book):
    // broken (had one, link is dead) → missing (never resolved) → low-confidence (resolved but risky).
    if (i.coverBroken) {
      brokenCover.push(item(i, 'broken_cover', 'the saved cover link is broken — replace it in the Cover Studio'))
    } else if (!hasCover(i)) {
      missingCover.push(item(i, 'missing_cover', 'no cover found — add one in the Cover Studio'))
    } else if (isLowConfidenceCover(i)) {
      lowConfidenceCover.push(
        item(i, 'low_confidence_cover', `cover match is ${i.coverConfidence} confidence — confirm or pick another edition`),
      )
    }

    if (i.unmappedGenre && i.unmappedGenre.trim()) {
      oddGenre.push(item(i, 'odd_genre', `unmapped genre "${i.unmappedGenre}" — set a genre`))
    }

    if (i.duplicateFlagged || i.duplicateDetected) {
      const why = i.duplicateFlagged && i.duplicateDetected ? 'flagged in the export and detected' : i.duplicateFlagged ? 'flagged in the export' : 'detected as a likely duplicate'
      likelyDuplicate.push(item(i, 'likely_duplicate', why))
    }
  }

  return {
    summary,
    needsLook: { missingCover, lowConfidenceCover, brokenCover, oddGenre, likelyDuplicate },
    coverTriage: [...missingCover, ...lowConfidenceCover, ...brokenCover],
  }
}

// ── Import integration: join the import pass + the (post-enrichment) books → the review model ──

/** Per-imported-book signals captured during the import pass — the bits NOT carried on the Book row. */
export interface ImportItemOutcome {
  bookId: string
  /** a fresh add, or deduped (folded) into an existing book */
  disposition: 'added' | 'merged'
  /** the export's Duplicate column flagged this row */
  duplicateFlagged?: boolean
  /** the raw genre cell when it didn't map to a core genre (ImportedRow.unmappedGenre) */
  unmappedGenre?: string | null
}

/**
 * Build the review model by joining the import pass's per-book outcomes with the current (post-
 * enrichment) book records. The Book is authoritative for title/author/genre/series/cover/
 * coverConfidence; the outcome supplies import-only signals (disposition, the export Duplicate flag,
 * the unmapped genre). A "detected duplicate" = a row that folded into an existing book (merged).
 * A cover with no recorded confidence is a trusted user/seed cover (treated as high, never flagged).
 * The odd-genre signal applies to fresh adds only — a merged row keeps the existing book's genre.
 * Outcomes whose book is absent from `books` are skipped.
 */
export function buildReviewModelFromImport(
  outcomes: readonly ImportItemOutcome[],
  books: readonly Book[],
  opts: { readingOrdersBuilt?: number; brokenRefs?: ReadonlySet<string> } = {},
): ReviewModel {
  const byId = new Map(books.map((b) => [b.id, b]))
  const items: ReviewItemInput[] = []
  for (const o of outcomes) {
    const b = byId.get(o.bookId)
    if (!b) continue
    const cover = b.cover || null
    items.push({
      ref: b.id,
      title: b.title,
      author: authorOf(b),
      disposition: o.disposition,
      inSeries: b.status !== 'standalone' || !!b.series,
      cover,
      coverConfidence: b.coverConfidence ?? (cover ? 'high' : 'none'),
      coverBroken: opts.brokenRefs?.has(b.id) ?? false, // runtime onerror signal (cover link is dead)
      coverAlternates: [], // re-fetched on demand by the Cover Studio (cached in enrichment_cache)
      genre: b.genre || null,
      unmappedGenre: o.disposition === 'added' ? (o.unmappedGenre ?? null) : null,
      duplicateFlagged: !!o.duplicateFlagged,
      duplicateDetected: o.disposition === 'merged',
    })
  }
  return buildReviewModel(items, opts)
}
