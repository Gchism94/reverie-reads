import { contrastRatio, mixSrgb, parseColor } from './adaptive'

// Spine tint — the shelf takes on the palette of the reader's actual editions. The cover's stored
// dominant colour (books.cover_color, extracted at ingest) is mixed into the skin's spine gradient
// endpoints (--spine-lo/--spine-hi), so every skin's spine RECIPE (sheen, bands, emboss, type) stays
// intact and simply consumes tinted endpoints. Pure + deterministic so the AA clamp is unit-tested
// against the registry token sample; the web layer feeds in the LIVE token values from the DOM.

/** Preferred tint strengths, strongest first — the clamp walks down until spine text clears AA. */
export const SPINE_TINT_MIXES = [0.34, 0.22, 0.12] as const

/** The live spine token values of the active skin/mode (read from the DOM by the web layer). */
export interface SpineTokenSample {
  /** --spine-title */
  title: string
  /** --spine-muted */
  muted: string
  /** --spine-lo (gradient tail) */
  lo: string
  /** --spine-hi (gradient head) */
  hi: string
}

export interface TintedSpine {
  lo: string
  hi: string
  /** the mix that survived the contrast clamp (telemetry/debug) */
  mix: number
}

/**
 * Tint the spine gradient endpoints with the book's dominant cover colour, clamped so the skin's
 * spine title AND author text keep ≥ 4.5:1 against the tinted gradient's midpoint (the same surface
 * the registry contrast test measures). Walks SPINE_TINT_MIXES strongest-first; returns null when
 * even the weakest mix would violate AA (caller falls back to the untinted skin default) or when
 * any input colour fails to parse.
 */
export function tintedSpineColors(tintHex: string, tokens: SpineTokenSample): TintedSpine | null {
  const tint = parseColor(tintHex)
  const title = parseColor(tokens.title)
  const muted = parseColor(tokens.muted)
  if (!tint || !title || !muted || !parseColor(tokens.lo) || !parseColor(tokens.hi)) return null

  for (const mix of SPINE_TINT_MIXES) {
    const lo = mixSrgb(tintHex, tokens.lo, mix)
    const hi = mixSrgb(tintHex, tokens.hi, mix)
    const mid = parseColor(mixSrgb(lo, hi, 0.5))!
    if (contrastRatio(title, mid) >= 4.5 && contrastRatio(muted, mid) >= 4.5) return { lo, hi, mix }
  }
  return null
}
