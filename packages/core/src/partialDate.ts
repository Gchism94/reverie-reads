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
 * The plan as a `plan_date` value, for the dual-write that keeps a rollback safe while both
 * representations exist.
 *
 * LOSSLESS-ONLY, and that phrase means exactly one thing here: a `plan_date` is written ONLY when
 * the trio is a complete y+m+d that a bare `date` column can hold without inventing anything.
 * Every partial plan — a year and month, or a year alone — returns null.
 *
 * The alternative is fabricating the missing parts (March → `2026-03-01`), and that is the specific
 * thing this whole feature exists to stop. A rolled-back app reads `plan_date` and cannot tell a
 * fabricated first-of-month from a day the reader actually chose; it would render "March 1st" as
 * fact. Writing null loses the plan on a rollback, which is visible and recoverable. Writing a lie
 * is neither.
 */
export function planDateForWrite(p: PlanDate | null | undefined): string | null {
  if (!p || p.y == null || p.m == null || p.d == null) return null
  const mm = String(p.m).padStart(2, '0')
  const dd = String(p.d).padStart(2, '0')
  return `${p.y}-${mm}-${dd}`
}

/** A legacy `plan_date` string → the trio. Used to read rows written before the app moved over. */
export function planFromDateString(s: string | null | undefined): PlanDate {
  if (!s) return emptyDate()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return emptyDate()
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}
