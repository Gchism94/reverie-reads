/**
 * Outbound pacing POLICY for catalog sources — the numbers and the arithmetic, kept here because
 * here is where they can be tested.
 *
 * The runtime that enforces this lives in `supabase/functions/_shared/sourcePace.ts`, which is Deno
 * and cannot import from this package (the same constraint that makes `_shared/coverUrl.ts` a copy
 * of part of `covers.ts`). That file duplicates the table below and nothing else; the test in
 * `sourcePace.test.ts` READS it and fails if the two ever disagree, so the copy cannot drift
 * silently even though no Deno test runner exists in this repo.
 *
 * ── Why the pacing is server-side at all ────────────────────────────────────────────────────────
 * It used to be a 220ms sleep inside `bulkComplete`'s loop — 4.5 requests/second, under a comment
 * quoting Open Library's 100-per-5-minutes, which is one per THREE seconds. Wrong by ~13x, and in
 * the wrong place: `importEnrich.ts` calls `bulkComplete` directly, and anything at all can call the
 * enrich Edge Function over HTTP. A client-side sleep paces one code path. The gate belongs on the
 * far side of the network boundary, where every caller has to pass through it.
 */

export type PacedSource = 'ol-covers' | 'ol-search' | 'google' | 'hardcover' | 'isbndb'

export interface SourceBudget {
  /** requests permitted per window — the source's own documented cap */
  max: number
  windowSecs: number
  /** minimum milliseconds between two calls, so a budget is not spent as a burst */
  gapMs: number
}

/**
 * From each source's own documentation (verified live, 2026-08-03):
 *
 *   ol-search  1 req/s anonymous; 3 req/s with a User-Agent carrying the app name AND a contact
 *              email. `_shared/olIdentity.ts` now sends exactly that on every OL call (guard:
 *              olIdentity.test.ts), so this is the identified tier: 3/s → 180/60s, gap 334ms
 *              (1000/3 rounded UP — sustained ≤ 2.99/s, never over the documented 3).
 *              An earlier comment here claimed the contact "which we send" while the actual UA
 *              carried no contact at all and the budget sat at the anonymous 1/s — the header and
 *              this table must tell the same story, which is why the guard covers both.
 *   ol-covers  "Currently only 100 requests/IP are allowed for every 5 minutes" (ISBN-keyed
 *              lookups; per-IP, NO User-Agent tier exists for this host) — deliberately NOT 3x'd.
 *
 * The two Open Library entries are SEPARATE on purpose: they are different endpoints with different
 * documented limits, and budgeting them together lets search traffic spend the covers allowance.
 */
export const SOURCE_BUDGETS: Readonly<Record<PacedSource, SourceBudget>> = {
  'ol-covers': { max: 100, windowSecs: 300, gapMs: 3000 },
  'ol-search': { max: 180, windowSecs: 60, gapMs: 334 },
  google: { max: 100, windowSecs: 60, gapMs: 200 },
  hardcover: { max: 60, windowSecs: 60, gapMs: 1000 },
  isbndb: { max: 60, windowSecs: 60, gapMs: 1000 },
}

/** The shared budget key. GLOBAL, not per-caller: the cap is on our egress IP, not on each reader. */
export const sourceBudgetKey = (source: PacedSource): string => `source:${source}:global`
