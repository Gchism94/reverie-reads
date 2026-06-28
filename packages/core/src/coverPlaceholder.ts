// Cover Studio pillar #3 (docs/COVER_SOURCING_AND_STUDIO.md): a skin-themed typographic placeholder
// for a cover-less book. The VISUAL — colours + display font — comes from the ACTIVE skin's CSS tokens
// at render time, so it's always on-brand and re-themes for free when the skin changes. This module is
// the PURE part: what to typeset (monogram + title + author) and which accent token to tint with,
// derived DETERMINISTICALLY from the book so a placeholder is stable across renders yet varied across
// books — while staying inside the skin's own palette (never a hardcoded colour).

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
