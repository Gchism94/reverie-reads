import type { ReadEntry } from './types'

/**
 * The audiobook-vs-print surface: per-format ratings derived from the reread log. `reads` already
 * carries `{format, rating}` per row, so this is rendering-side aggregation, not schema.
 *
 * ── THE DISPLAY RULE, decided rather than left open ─────────────────────────────────────────────
 * When formats disagree, show the MOST RECENT rated read per format, side by side. Not the
 * highest — that is a flattering lie about the worse format. Not an average — averaging a
 * reader's own rereads invents a number nobody gave, the same disease as the aggregate score the
 * app refuses ("no aggregate rating", AGENTS.md), one shelf closer to home. The read's own
 * comment in LogReadForm says what a read-rating IS: "how was this time through" — so the current
 * opinion of a format is the LAST time through in that format, and that is what renders.
 *
 * Returned only when it says something the book rating doesn't: fewer than two formats with rated
 * reads returns [] and the surface stays absent (the per-read history rows already show the one
 * format's story).
 */
export interface FormatRating {
  format: string
  /** the most recent rated read's rating in this format */
  rating: number
  /** ISO date of that read — the receipt that makes "most recent" checkable in the UI */
  date: string
}

export function latestRatingByFormat(reads: readonly ReadEntry[]): FormatRating[] {
  const byFormat = new Map<string, FormatRating>()
  for (const r of reads) {
    if (!r.format || !r.rating) continue
    const cur = byFormat.get(r.format)
    if (!cur || r.date > cur.date) {
      byFormat.set(r.format, { format: r.format, rating: r.rating, date: r.date })
    }
  }
  if (byFormat.size < 2) return []
  return [...byFormat.values()].sort((a, b) => (a.date < b.date ? 1 : -1))
}
