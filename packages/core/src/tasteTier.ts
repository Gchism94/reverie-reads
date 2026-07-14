import type { SkinId } from './skins'

// Taste display band (owner-approved): fixed per-user anchors + named tiers, replacing the per-shelf
// min-max rescale. The taste engine still SORTS by raw cosine; this module only decides how a cosine
// is DISPLAYED. Given the reader's two calibration anchors (see supabase taste_calibration()), a raw
// cosine maps to a stable 0–1 band and one of four absolute tiers — the same tier wherever the book
// appears, comparable across shelves, because the anchors are the reader's, not the shelf's.

/** The reader's calibration anchors: lo = baseline floor, hi = "what deeply-me looks like". */
export interface TasteAnchors {
  lo: number
  hi: number
}

/** Tier ids, strongest → floor. The floor is "a departure worth trying" — never "not for you"
 *  (a genre-tight library means even a low match is plausibly the reader's). */
export const TASTE_TIERS = ['recognition', 'belonging', 'adjacency', 'departure'] as const
export type TasteTier = (typeof TASTE_TIERS)[number]
export type TasteTierIndex = 0 | 1 | 2 | 3

/** Absolute boundaries over the calibrated [0,1] band — even quarters (NOT quantiles of the loaded
 *  candidates: that would reintroduce the min-max problem). A band value ≥ bound[i] is tier i.
 *  Observed on real data (290-book seed) this spreads the library across all four tiers, non-monotone;
 *  kept as one constant so the split is tunable in a single place. */
export const TASTE_TIER_BOUNDS = [0.75, 0.5, 0.25] as const

/** Map a raw cosine to the calibrated 0–1 band between the anchors (clamped). Stable per book between
 *  recalibrations; the same cosine yields the same band on every shelf. */
export function calibratedBand(cos: number, a: TasteAnchors): number {
  const span = a.hi - a.lo
  if (!(span > 0)) return cos >= a.hi ? 1 : 0 // degenerate anchors — never divide by zero
  return Math.min(1, Math.max(0, (cos - a.lo) / span))
}

/** Which absolute tier a cosine lands in (0 = recognition … 3 = departure). */
export function tasteTierIndex(cos: number, a: TasteAnchors): TasteTierIndex {
  const band = calibratedBand(cos, a)
  if (band >= TASTE_TIER_BOUNDS[0]) return 0
  if (band >= TASTE_TIER_BOUNDS[1]) return 1
  if (band >= TASTE_TIER_BOUNDS[2]) return 2
  return 3
}

/** The anchored percentage — the drill-down number kept under the tier (never the headline). It is
 *  the calibrated band ×100 (1–99), so it too is stable per book and comparable across shelves —
 *  unlike the old per-shelf rescale. */
export function tastePercentAnchored(cos: number, a: TasteAnchors): number {
  return Math.min(99, Math.max(1, Math.round(calibratedBand(cos, a) * 100)))
}

// ── Per-skin tier vocabulary ──
// Each skin names the four tiers in its own voice; the neutral baseline covers the adaptive skin and
// any future skin until it earns its own set. Never dismissive at the floor. PROPOSED — pending the
// owner's review (see the PR's nine-skin table); the mechanism doesn't depend on the exact words.

export const NEUTRAL_TASTE_TIERS: readonly [string, string, string, string] = [
  'Deeply you',
  'In your orbit',
  'A little further out',
  'A departure',
]

/** Per-skin tier labels, strongest → floor. Keyed off every SkinId so a new skin fails loudly here. */
export const TASTE_TIER_LABELS: Record<SkinId, readonly [string, string, string, string]> = {
  // Romance — decadent invitation
  tryst: ['Made for you', 'Your kind of trouble', 'A curious temptation', 'A walk on the wild side'],
  // Fantasy — spellbook / binding
  grimoire: ['Bound to you', 'Your kind of magic', 'A curious enchantment', 'Beyond the wards'],
  // Sci-fi — orbital distance (lean in)
  aphelion: ['Dead center', 'In your orbit', 'The outer reaches', 'Deep space'],
  // Horror — visceral
  marrow: ['In your blood', 'Your kind of dread', 'A curious chill', 'Into the dark'],
  // Mystery (Gaslight) — the case
  umbra: ['Case closed', 'A strong lead', 'A faint trail', 'A cold case'],
  // Literary (Marginalia) — the editor's hand
  folio: ['Dog-eared', 'Underlined', 'A note in the margin', 'An uncut page'],
  // Cozy — the warm house
  hearth: ['A place by the fire', 'Pull up a chair', 'A knock at the door', 'Out in the weather'],
  // Nonfiction — field reference
  almanac: ['Field-verified', 'In your region', 'Off the trail', 'Uncharted country'],
  // Young adult (Firstlight) — dawn / bloom
  bloom: ['In full bloom', 'Coming into bloom', 'A late bloom', 'A seed on the wind'],
}

/** The tier label for a skin (falls back to the neutral set for adaptive / unknown skins). */
export function tasteTierLabel(skin: SkinId | 'adaptive' | string, index: TasteTierIndex): string {
  const set = (TASTE_TIER_LABELS as Record<string, readonly [string, string, string, string]>)[skin] ?? NEUTRAL_TASTE_TIERS
  return set[index]
}

/** Which already-AA-tested token the tier chip paints in: the top tier lit in the skin accent, the
 *  floor quieted to muted, the middle in ink. All three (accent-ink / ink / muted on card) are covered
 *  by the registry-keyed contrast test for every skin × mode. */
export const TASTE_TIER_TOKEN: Record<TasteTierIndex, 'accent-ink' | 'ink' | 'muted'> = {
  0: 'accent-ink',
  1: 'ink',
  2: 'ink',
  3: 'muted',
}
