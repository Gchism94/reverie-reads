// Cover Studio pillar #3 (docs/reference/COVER_SOURCING_AND_STUDIO.md): a skin-themed typographic placeholder
// for a cover-less book. The VISUAL — colours + display font — comes from the ACTIVE skin's CSS tokens
// at render time, so it's always on-brand and re-themes for free when the skin changes. This module is
// the PURE part: what to typeset (monogram + title + author) and which accent token to tint with,
// derived DETERMINISTICALLY from the book so a placeholder is stable across renders yet varied across
// books — while staying inside the skin's own palette (never a hardcoded colour).

import { mixSrgb } from './adaptive'

/** The skin accent tokens a placeholder may tint with — all on-palette in every skin/mode. */
export const PLACEHOLDER_ACCENTS = ['--accent-fill', '--violet', '--blue', '--gold'] as const
export type PlaceholderAccent = (typeof PLACEHOLDER_ACCENTS)[number]

/** An accent recipe: one token, or a fixed 50/50 blend of two. Blends stay INSIDE the skin's own
 *  palette (both endpoints are skin tokens) while widening the per-book variety. */
export interface AccentRecipe {
  a: PlaceholderAccent
  b?: PlaceholderAccent
}

/** Fraction of `a` in a two-token blend — one constant shared by the CSS and the contrast test. */
export const PLACEHOLDER_BLEND = 0.5

/**
 * The discrete accent space: 4 pure tokens + the 6 pairwise 50/50 blends = 10 recipes.
 *
 * WHY 10 AND WHY DISCRETE (feat/discover-phase-a). Four accents meant two same-series books
 * collided 1-in-4, and same-series is exactly where placeholders cluster — after the series
 * backfill, an ACOTAR shelf full of identical plates. A continuous hue rotation would distinguish
 * more but cannot be PROVEN: the contrast test enumerates skin × mode × accent from the SKINS
 * registry, and a continuum has no enumeration. Ten fixed recipes keep the exhaustive-proof
 * machinery intact — every one is asserted ≥ AA in every skin, both modes, like the original four.
 */
export const PLACEHOLDER_ACCENT_RECIPES: readonly AccentRecipe[] = [
  ...PLACEHOLDER_ACCENTS.map((a) => ({ a })),
  ...PLACEHOLDER_ACCENTS.flatMap((a, i) => PLACEHOLDER_ACCENTS.slice(i + 1).map((b) => ({ a, b }))),
]

export interface PlaceholderSpec {
  title: string
  author: string
  /** 1–2 character monogram drawn large — THE distinguishing mark at spine widths, where the
   *  title truncates to a shared prefix ("A Court of…" five times over) */
  initials: string
  /** which accent recipe to tint with — deterministic per book, from the skin's own palette */
  accent: AccentRecipe
}

/** Stable non-negative hash of a string (deterministic accent selection). */
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const MONOGRAM_SKIP = new Set(['the', 'a', 'an', 'of', 'and', '&'])

/** A 1–2 letter monogram from the title's first significant words (✦ when there are none). */
export function monogram(title: string): string {
  const words = String(title ?? '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const significant = words.filter((w) => !MONOGRAM_SKIP.has(w.toLowerCase()))
  const pick = (significant.length ? significant : words).slice(0, 2)
  const letters = pick.map((w) => [...w][0]?.toUpperCase() ?? '').join('')
  return letters || '✦'
}

/** Derive the deterministic placeholder spec for a book (title + optional split author name).
 *
 *  The hash keys on `title|author` — content, not id, so the same book shows the same accent on
 *  every surface including pre-add Discover hits that have no id yet; author folded in so two
 *  same-titled books by different authors stop sharing a plate. (Same-series books share the
 *  author, so THEIR separation comes from the title tail + the 10-recipe space + the monogram.) */
export function placeholderSpec(book: {
  title?: string
  first?: string
  last?: string
}): PlaceholderSpec {
  const title = String(book.title ?? '')
  const author = [book.first, book.last].filter(Boolean).join(' ').trim()
  const key = `${title}|${author}`
  const accent = PLACEHOLDER_ACCENT_RECIPES[
    hash(key === '|' ? '∅' : key) % PLACEHOLDER_ACCENT_RECIPES.length
  ] as AccentRecipe
  return { title, author, initials: monogram(title), accent }
}

// ── Contrast-safe colour recipe ────────────────────────────────────────────────────────────────
// The placeholder must clear WCAG AA at every skin × mode. The earlier version tinted the glyph in the
// raw accent hue against an accent-tinted surface, with no contrast floor — it landed as low as 1.3:1
// (near-invisible in light modes). The recipe below is safe BY CONSTRUCTION: the background carries the
// skin FLAVOUR (a light accent tint over the OPAQUE card), while the glyph is anchored to the skin's
// AA-validated `--ink`, only PARTLY pulled toward the accent — so it keeps accent character but can't
// drift far from ink's luminance. The fixed surface is `--card-solid` (opaque in every skin), not the
// translucent `--card`, so the rendered contrast is deterministic rather than depending on whatever
// gradient sits behind the cover box. `coverPlaceholder.contrast.test.ts` proves ≥ 4.5:1 across the
// full token matrix; these fractions are the single source the component's CSS and that test share.

/** Accent fraction in the background tint (rest is `--card-solid`). Keeps the skin's flavour.
 *  Lowered from .18 for the Fable 5 chunk-3 palettes: mid-luminance cards (Hearth's lamplit linen,
 *  Almanac's ink-block) have far less ink↔card headroom than the first skins, and the old pull
 *  landed accents near the midpoint (as low as 3.3:1). Both fractions shrinking only ever RAISES
 *  contrast, so every existing skin stays safe. (The plain plate is fallback-only now — all nine
 *  skins ship designed placeholder plates.) */
export const PLACEHOLDER_BG_MIX = 0.1
/** Accent fraction in the glyph colour (rest is `--ink`). Accent character, ink-anchored for contrast. */
export const PLACEHOLDER_FG_MIX = 0.28 // 0.3 grazed 4.496:1 on Hearth's toasted linen (verdict 1b)

/** The CSS expression for an accent recipe — a bare token var, or a 50/50 `color-mix` of two.
 *  Nesting this inside the recipe mixes below is valid CSS (`color-mix` accepts any color value). */
export const accentCss = (r: AccentRecipe): string =>
  r.b ? `color-mix(in srgb, var(${r.a}) ${PLACEHOLDER_BLEND * 100}%, var(${r.b}))` : `var(${r.a})`

/** The same recipe resolved to a concrete hex, given the skin/mode's token values — what the
 *  contrast test feeds {@link resolvePlaceholderColors}. Mirrors {@link accentCss} exactly. */
export const resolveAccentRecipe = (
  r: AccentRecipe,
  tokens: Record<PlaceholderAccent, string>,
): string => (r.b ? mixSrgb(tokens[r.a], tokens[r.b], PLACEHOLDER_BLEND) : tokens[r.a])

/** The placeholder's CSS colours for a chosen accent recipe — `color-mix` over live skin tokens, so
 *  it re-themes for free. The component spreads this onto the surface (bg) and glyph (color). */
export function placeholderColorVars(accent: AccentRecipe): {
  background: string
  color: string
} {
  const a = accentCss(accent)
  return {
    background: `color-mix(in srgb, ${a} ${PLACEHOLDER_BG_MIX * 100}%, var(--card-solid))`,
    color: `color-mix(in srgb, ${a} ${PLACEHOLDER_FG_MIX * 100}%, var(--ink))`,
  }
}

/** The same recipe resolved to concrete hex, given a skin/mode's token values — the pure form the
 *  contrast test asserts on. Mirrors {@link placeholderColorVars} channel-for-channel. */
export function resolvePlaceholderColors(tokens: {
  accent: string
  ink: string
  cardSolid: string
}): {
  background: string
  color: string
} {
  return {
    background: mixSrgb(tokens.accent, tokens.cardSolid, PLACEHOLDER_BG_MIX),
    color: mixSrgb(tokens.accent, tokens.ink, PLACEHOLDER_FG_MIX),
  }
}
