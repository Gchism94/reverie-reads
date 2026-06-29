// Cover Studio pillar #3 (docs/COVER_SOURCING_AND_STUDIO.md): a skin-themed typographic placeholder
// for a cover-less book. The VISUAL — colours + display font — comes from the ACTIVE skin's CSS tokens
// at render time, so it's always on-brand and re-themes for free when the skin changes. This module is
// the PURE part: what to typeset (monogram + title + author) and which accent token to tint with,
// derived DETERMINISTICALLY from the book so a placeholder is stable across renders yet varied across
// books — while staying inside the skin's own palette (never a hardcoded colour).

import { mixSrgb } from './adaptive'

/** The skin accent tokens a placeholder may tint with — all on-palette in every skin/mode. */
export const PLACEHOLDER_ACCENTS = ['--accent-fill', '--violet', '--blue', '--gold'] as const
export type PlaceholderAccent = (typeof PLACEHOLDER_ACCENTS)[number]

export interface PlaceholderSpec {
  title: string
  author: string
  /** 1–2 character monogram drawn large (the typographic focal point) */
  initials: string
  /** which accent CSS variable to tint with — deterministic per book, from the skin's own palette */
  accentVar: PlaceholderAccent
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

/** Derive the deterministic placeholder spec for a book (title + optional split author name). */
export function placeholderSpec(book: { title?: string; first?: string; last?: string }): PlaceholderSpec {
  const title = String(book.title ?? '')
  const author = [book.first, book.last].filter(Boolean).join(' ').trim()
  const accentVar = PLACEHOLDER_ACCENTS[hash(title || author || '∅') % PLACEHOLDER_ACCENTS.length] as PlaceholderAccent
  return { title, author, initials: monogram(title), accentVar }
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

/** Accent fraction in the background tint (rest is `--card-solid`). Keeps the skin's flavour. */
export const PLACEHOLDER_BG_MIX = 0.18
/** Accent fraction in the glyph colour (rest is `--ink`). Accent character, ink-anchored for contrast. */
export const PLACEHOLDER_FG_MIX = 0.5

/** The placeholder's CSS colours for a chosen accent var — `color-mix` over live skin tokens, so it
 *  re-themes for free. The component spreads this onto the surface (bg) and glyph (color). */
export function placeholderColorVars(accentVar: PlaceholderAccent): { background: string; color: string } {
  return {
    background: `color-mix(in srgb, var(${accentVar}) ${PLACEHOLDER_BG_MIX * 100}%, var(--card-solid))`,
    color: `color-mix(in srgb, var(${accentVar}) ${PLACEHOLDER_FG_MIX * 100}%, var(--ink))`,
  }
}

/** The same recipe resolved to concrete hex, given a skin/mode's token values — the pure form the
 *  contrast test asserts on. Mirrors {@link placeholderColorVars} channel-for-channel. */
export function resolvePlaceholderColors(tokens: { accent: string; ink: string; cardSolid: string }): {
  background: string
  color: string
} {
  return {
    background: mixSrgb(tokens.accent, tokens.cardSolid, PLACEHOLDER_BG_MIX),
    color: mixSrgb(tokens.accent, tokens.ink, PLACEHOLDER_FG_MIX),
  }
}
