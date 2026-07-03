// Spine slot data helpers. Two data-reality checks the specimen's tidy sample titles hide:
//
// 1. SHELF DIMENSIONS. The spec wants width to track thickness (page count) and height to track trim.
//    Neither exists in the Book model — page count isn't stored, and trim size is essentially never in a
//    Goodreads/StoryGraph export. So both come from a STABLE per-book hash: deterministic (a book is
//    always the same spine), varied book-to-book, and never collapsing to uniform bars (the make-or-break
//    for a shelf). If a real page-count field is added later, wire `thickness` to it — the seam is here.
//
// 2. PAST THE 13px FLOOR. "Scale to a 13px floor" is right for normal titles, but real metadata has
//    monsters (title + subtitle + series). fitSpineTitle scales down to the floor, then TRUNCATES with an
//    ellipsis so the title can't overflow the spine — the colophon (a separate element) stays anchored.

/** FNV-1a string hash → uint32. Stable across runs/devices. */
function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Per-book spine dimensions as 0..1 factors (caller maps to px). `thickness` → width (page-count
 *  proxy), `trim` → height. Deterministic from the book id; varies book-to-book, never uniform. */
export function spineDims(seed: string): { thickness: number; trim: number } {
  const h = hash32(seed || 'spine')
  const thickness = (h & 0xffff) / 0xffff // 0..1
  const trim = ((h >>> 16) & 0xffff) / 0xffff // 0..1 (independent of thickness)
  return { thickness, trim }
}

/**
 * Fit a title to the spine's available length. Returns the font size (px, clamped to [min,max]) and the
 * text to render — full title when it fits, else truncated with an ellipsis at the min-size floor so it
 * never overflows. `charRatio` ≈ a glyph's advance as a fraction of font size for vertical type.
 */
export function fitSpineTitle(
  title: string,
  availPx: number,
  opts?: { min?: number; max?: number; charRatio?: number },
): { text: string; fontPx: number; truncated: boolean } {
  const min = opts?.min ?? 13
  const max = opts?.max ?? 22
  const ratio = opts?.charRatio ?? 0.62
  const len = Math.max(1, title.length)
  const fontPx = Math.max(min, Math.min(max, Math.floor(availPx / (len * ratio))))
  const maxChars = Math.max(1, Math.floor(availPx / (fontPx * ratio)))
  if (title.length <= maxChars) return { text: title, fontPx, truncated: false }
  return { text: `${title.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`, fontPx, truncated: true }
}

/** Deterministic catalog callsign for archive-style spines / plates (Aphelion's `APH·07 / 0318`).
 *  Stable per book id; prefix is the skin's 3-letter call (derived from the skin id by the caller). */
export function callsign(seed: string, prefix: string): { code: string; id: string } {
  const h = hash32(seed || 'callsign')
  const code = `${prefix}·${String((h % 12) + 1).padStart(2, '0')}`
  const id = String(((h >>> 8) % 9000) + 1000)
  return { code, id }
}
