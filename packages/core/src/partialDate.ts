import type { PartialDate, PlanDate } from './types'

/**
 * Month abbreviations, canonical. Lives here rather than in the web app because `formatPartialDate`
 * needs it and that function must be testable without a browser; `apps/web` re-exports it as
 * `MONTHS` so its calendar and stats labels keep the name they already use. One list, not two.
 */
export const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** A date the reader has said nothing about. A factory, not a shared constant — callers store it. */
export function emptyDate(): PartialDate {
  return { y: null, m: null, d: null }
}

/** Has the reader stated anything at all? Precision below the year is meaningless without one. */
export function hasDate(p: PartialDate | null | undefined): boolean {
  return !!p && p.y != null
}

/**
 * Render a partial date at the highest precision it actually carries: `Mar 14, 2026`, `Mar 2026`,
 * `2026`, or `''`.
 *
 * REPLACES TWO DIVERGED COPIES of `fmtPub` (BookDetailRoute and PlannerRoute). They differed on one
 * thing — the guard on the month lookup:
 *
 *   BookDetailRoute:  `${MONTHS[p.m - 1] ?? ''} ${p.y}`   → an out-of-range month renders ' 2026'
 *   PlannerRoute:     `${MONTHS[p.m - 1]} ${p.y}`         → the same input renders 'undefined 2026'
 *
 * Neither is kept verbatim. The unguarded one can print `undefined` to a reader, which is strictly
 * worse; the guarded one prints a stray leading space, which is merely quieter about the same
 * broken data. So the rule here is one step further and states itself: render at the highest
 * precision whose parts are RENDERABLE. An unusable month falls back to the year alone rather than
 * emitting a blank where a name should be.
 *
 * Unreachable through stored data today — `books_pub_m_check` and `books_plan_m_check` both bound
 * the column to 1..12 — so this is about what the function does when handed a month the database
 * would have refused, which is exactly the case the two copies disagreed on.
 */
export function formatPartialDate(p: PartialDate | null | undefined): string {
  if (!p || p.y == null) return ''
  const month = p.m != null ? MONTH_ABBR[p.m - 1] : undefined
  if (month && p.d != null) return `${month} ${p.d}, ${p.y}`
  if (month) return `${month} ${p.y}`
  return String(p.y)
}

/**
 * A legacy `plan_date` string → the trio.
 *
 * The app no longer WRITES `plan_date` — that dual-write is gone. This read path survives it on
 * purpose: a row last written between the trio migration deploying and the trio frontend going live
 * carries a plan in `plan_date` with an empty trio, and reading those as "no plan" would make a real
 * plan vanish from the library. It goes when a backfill migration has provably converted them.
 */
export function planFromDateString(s: string | null | undefined): PlanDate {
  if (!s) return emptyDate()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return emptyDate()
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}
