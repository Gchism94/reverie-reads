import { describe, expect, it } from 'vitest'
import { contrastRatio, mixSrgb, parseColor } from './adaptive'
import { SPINE_TINT_MIXES, tintedSpineColors, type SpineTokenSample } from './spineTint'

// Tryst/dark sample: gilt title on a deep plum gradient — lots of contrast headroom.
const DARK: SpineTokenSample = { title: '#f0b14e', muted: '#caa9c4', lo: '#1f0a18', hi: '#3c1428' }
// Umbra/dark paper strip sample: DARK type on a LIGHT strip — headroom shrinks fast under dark tints.
const LIGHT_SURFACE: SpineTokenSample = { title: '#2a251c', muted: '#5d574a', lo: '#e2d9c2', hi: '#e2d9c2' }

describe('tintedSpineColors', () => {
  it('is deterministic and returns the strongest AA-safe mix', () => {
    const a = tintedSpineColors('#7a3b5e', DARK)
    const b = tintedSpineColors('#7a3b5e', DARK)
    expect(a).toEqual(b)
    expect(a).not.toBeNull()
    expect(a!.mix).toBe(SPINE_TINT_MIXES[0]) // plenty of headroom on the dark binding
  })

  it('tints the endpoints toward the cover colour', () => {
    const t = tintedSpineColors('#7a3b5e', DARK)!
    expect(t.lo).toBe(mixSrgb('#7a3b5e', DARK.lo, t.mix))
    expect(t.hi).toBe(mixSrgb('#7a3b5e', DARK.hi, t.mix))
    expect(t.lo).not.toBe(DARK.lo)
  })

  it('keeps title AND muted ≥ 4.5:1 against the tinted midpoint', () => {
    for (const tint of ['#e74c3c', '#3498db', '#f5e642', '#ffffff', '#000000']) {
      const t = tintedSpineColors(tint, DARK)
      if (!t) continue
      const mid = parseColor(mixSrgb(t.lo, t.hi, 0.5))!
      expect(contrastRatio(parseColor(DARK.title)!, mid)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(parseColor(DARK.muted)!, mid)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('steps down the mix (clamps) when a strong tint would sink the muted author text', () => {
    // A near-black tint over the light strip: full strength buries #5d574a, weaker mixes survive.
    const t = tintedSpineColors('#1a1208', LIGHT_SURFACE)
    if (t) expect(t.mix).toBeLessThan(SPINE_TINT_MIXES[0])
  })

  it('returns null (skin default) when even the weakest mix violates AA', () => {
    // Muted #5d574a on the light strip has ~4.9:1 headroom; a saturated mid-luminance tint kills it.
    const t = tintedSpineColors('#6e6152', { ...LIGHT_SURFACE, muted: '#6a6455' })
    // Whether or not this exact tint fails, a mid-gray surface with mid-gray text must:
    const hopeless = tintedSpineColors('#808080', { title: '#6a6a6a', muted: '#6a6a6a', lo: '#777777', hi: '#777777' })
    expect(hopeless).toBeNull()
    if (t) expect(t.mix).toBeLessThanOrEqual(SPINE_TINT_MIXES[1])
  })

  it('returns null on unparseable colours', () => {
    expect(tintedSpineColors('not-a-colour', DARK)).toBeNull()
    expect(tintedSpineColors('#e74c3c', { ...DARK, lo: 'var(--spine-lo)' })).toBeNull()
    expect(tintedSpineColors('', DARK)).toBeNull()
  })
})
