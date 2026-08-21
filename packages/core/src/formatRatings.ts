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
  /**
   * That same read's own words — `reads.notes`, which is per-read and therefore already
   * per-format. It rides with the rating rather than being looked up separately, so the star and
   * the sentence beside it can never come from different reads: one pick, one row, one opinion.
   * Empty string when that read carried none.
   */
  notes: string
}

/**
 * "More recent", made TOTAL — the same answer for any input order (fix/format-rating-tiebreak).
 *
 * The first shipped version compared `r.date > cur.date` alone: strict, so ties — two reads of a
 * format sharing a `read_on`, or both lacking one — kept whichever row the fetch happened to hand
 * over first, and the displayed rating could change between fetches with nothing on screen saying
 * why. Same class as list_sort_order (#294): an ordering with no tiebreak is a coin the database
 * flips for you. The rule, decided 2026-08-20:
 *
 *   1. Latest `read_on` wins.
 *   2. A dated read beats an undated one, always — an undated read must never outrank a dated one
 *      merely by arriving first. (Undated maps to `date: ''`, which string-compares below every
 *      real date — stated as a rule here rather than left as an accident of that mapping.)
 *   3. Ties on `read_on` break by latest `createdAt` — same reading date, logged afterward, so
 *      it is the more recent statement. Where `createdAt` is absent (CSV-imported entries carry
 *      none) the tiebreak honestly degrades to first-encountered.
 *
 * REJECTED, so it isn't revisited: highest-rating-wins. It flatters the format — the same
 * objection that ruled out `highest` when this module chose "most recent rated read per format"
 * over it (see the display-rule block above).
 */
type Pick = FormatRating & { createdAt: string }

function moreRecent(a: Pick, b: Pick): boolean {
  if (a.date !== b.date) return a.date > b.date // rules 1 and 2: '' sorts below every real date
  return a.createdAt > b.createdAt // rule 3; equal-or-absent keeps the incumbent
}

export function latestRatingByFormat(reads: readonly ReadEntry[]): FormatRating[] {
  const byFormat = new Map<string, Pick>()
  for (const r of reads) {
    if (!r.format || !r.rating) continue
    const cand: Pick = {
      format: r.format,
      rating: r.rating,
      date: r.date,
      notes: r.notes ?? '',
      createdAt: r.createdAt ?? '',
    }
    const cur = byFormat.get(r.format)
    if (!cur || moreRecent(cand, cur)) byFormat.set(r.format, cand)
  }
  if (byFormat.size < 2) return []
  return [...byFormat.values()]
    .sort((a, b) =>
      // The rendered ORDER is total too — a date tie between formats falls to the format name,
      // so the row order cannot swap between fetches either.
      a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.format.localeCompare(b.format),
    )
    .map(({ format, rating, date, notes }) => ({ format, rating, date, notes }))
}
