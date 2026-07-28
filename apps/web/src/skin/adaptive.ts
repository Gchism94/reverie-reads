import {
  ADAPTIVE_CARRY_KEYS,
  ADAPTIVE_COLOR_KEYS,
  blendPalette,
  computeSkinWeights,
  dominantSkin,
  nudgeForAA,
  SKIN_ORDER,
  tasteInsight,
  type AdaptiveBundle,
  type AdaptivePending,
  type Book,
  type Palette,
  type ResolvedMode,
  type SkinId,
} from '@reverie/core'

const ALL_KEYS = [...ADAPTIVE_COLOR_KEYS, ...ADAPTIVE_CARRY_KEYS]

/** Read a Tier-1 skin's live token values out of the stylesheet via an offscreen element. */
function readPalette(skin: SkinId, mode: ResolvedMode): Palette {
  const el = document.createElement('div')
  el.style.display = 'none'
  el.dataset.skin = skin
  el.dataset.mode = mode
  document.body.appendChild(el)
  const cs = getComputedStyle(el)
  const p: Palette = {}
  for (const k of ALL_KEYS) p[k] = cs.getPropertyValue(k).trim()
  document.body.removeChild(el)
  return p
}

function blendForMode(mode: ResolvedMode, weights: number[]): Palette {
  const palettes = SKIN_ORDER.map((id) => readPalette(id, mode))
  return nudgeForAA(blendPalette(palettes, weights))
}

function blendBundle(
  weights: Record<SkinId, number>,
  dominant: SkinId,
  insight: string,
): AdaptiveBundle {
  const ordered = SKIN_ORDER.map((id) => weights[id])
  return {
    light: blendForMode('light', ordered),
    dark: blendForMode('dark', ordered),
    dominant,
    weights,
    insight,
  }
}

/**
 * Generate the adaptive bundle from the reader's library: taste → Tier-1 weights → blended
 * (and AA-nudged) light + dark palettes. Deterministic given the same books + current token CSS.
 */
export function generateAdaptiveBundle(books: readonly Book[]): AdaptiveBundle {
  const weights = computeSkinWeights(books)
  return blendBundle(weights, dominantSkin(weights), tasteInsight(weights))
}

/** Materialize the palette for a cron-detected pending suggestion (uses its weights, not the books). */
export function materializeAdaptive(pending: AdaptivePending): AdaptiveBundle {
  return blendBundle(pending.weights, pending.dominant, pending.insight)
}

/** The adaptive palette for a mode as inline CSS custom properties (for <html> or a preview card). */
export function adaptiveVars(bundle: AdaptiveBundle, mode: ResolvedMode): Record<string, string> {
  return mode === 'light' ? bundle.light : bundle.dark
}
