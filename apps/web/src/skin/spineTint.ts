import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { tintedSpineColors, type SpineTokenSample } from '@reverie/core'
import { useSkin } from './useSkin'
import { useEffectiveSkin } from './labels'

// Per-book spine tint — the web half of core's tintedSpineColors. Reads the ACTIVE skin/mode's live
// spine tokens from the DOM (no value duplication with tokens.css) and, when the cover's stored
// dominant colour clears the AA clamp, overrides ONLY the gradient endpoints via inline custom
// properties. The skin's spine recipe (sheen, bands, emboss, type colours) consumes them untouched —
// a tint parameter, not a hardcoded override. Falls back to the skin default when the clamp says no.

const cache = new Map<string, SpineTokenSample | null>()

function readSpineTokens(cacheKey: string): SpineTokenSample | null {
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null
  if (typeof document === 'undefined') return null
  const cs = getComputedStyle(document.documentElement)
  const read = (name: string) => cs.getPropertyValue(name).trim()
  const sample: SpineTokenSample = {
    title: read('--spine-title'),
    muted: read('--spine-muted'),
    lo: read('--spine-lo'),
    hi: read('--spine-hi'),
  }
  const ok = sample.title && sample.muted && sample.lo && sample.hi
  cache.set(cacheKey, ok ? sample : null) // jsdom / unstyled docs → tint stays off
  return ok ? sample : null
}

/**
 * Inline CSS-var overrides for a tinted spine, or undefined for the skin default (no colour, no
 * headroom, or an environment without resolved tokens).
 */
export function useSpineTintStyle(coverColor?: string): CSSProperties | undefined {
  const skin = useEffectiveSkin()
  const mode = useSkin((s) => s.resolvedMode)
  return useMemo(() => {
    if (!coverColor || typeof document === 'undefined') return undefined
    // Key the cache by the ATTRIBUTES actually applied (adaptive skin ≠ its effective label skin);
    // skin/mode in the deps just retrigger the read when the reader flips theme.
    void skin
    void mode
    const root = document.documentElement
    const tokens = readSpineTokens(`${root.dataset.skin}/${root.dataset.mode}`)
    if (!tokens) return undefined
    const t = tintedSpineColors(coverColor, tokens)
    if (!t) return undefined
    return { '--spine-lo': t.lo, '--spine-hi': t.hi } as CSSProperties
  }, [coverColor, skin, mode])
}
