/**
 * Import-side rating coercion: clamp to 0–5 and snap to the app's half-star grid.
 *
 * ── WHY SNAP-TO-0.5 AND NOT KEEP-AS-GIVEN, decided rather than inherited ────────────────────────
 * StoryGraph rates in QUARTER stars (1.25, 3.75 …) and its CSV export carries them. Keeping the
 * finer value is a mirage twice over: `books.rating` is `numeric(2,1)`, so Postgres would silently
 * round 3.75 → 3.8 anyway — the exact silent-coercion class this function exists to retire — and
 * the Stars control renders/edits the half grid, so a stored 3.8 would DISPLAY as 4.0 and be
 * unreproducible the moment the reader touches it. A value slightly coarser than the source, taken
 * once and visibly, beats a value the app can neither show nor re-enter. Snapping at import (the
 * ecosystem convention for StoryGraph CSVs: 1.25 → 1.5) makes the coercion happen in ONE named
 * place instead of three ways in three files — which is what this replaces: three `Math.round`
 * calls that predate half stars and inflated every 4.5 to 5 on the way in.
 *
 * 0 stays 0: app-wide, 0 means UNRATED ("no rating yet"), and the CSV merge never writes a falsy
 * rating over an existing one. This function never turns an unrated row into a rated one.
 */
export function snapHalfRating(raw: number): number {
  if (!Number.isFinite(raw)) return 0
  return Math.max(0, Math.min(5, Math.round(raw * 2) / 2))
}
