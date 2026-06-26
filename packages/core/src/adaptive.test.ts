import { describe, expect, it } from 'vitest'
import {
  ADAPTIVE_COLOR_KEYS,
  blendPalette,
  computeSkinWeights,
  contrastRatio,
  dominantSkin,
  formatColor,
  isMaterialShift,
  nudgeForAA,
  parseColor,
  tasteInsight,
  weightDistance,
  type Palette,
} from './adaptive'
import { makeBook } from './book.fixture'

/** Fill every blendable key with one colour, plus carry keys, for a complete test palette. */
const solidPalette = (color: string, carry: Partial<Palette> = {}): Palette => {
  const p: Palette = {}
  for (const k of ADAPTIVE_COLOR_KEYS) p[k] = color
  return { '--shadow': '0 1px 2px #000', '--font-display': 'serif', ...carry, ...p }
}

describe('colour parsing + contrast', () => {
  it('parses hex and rgba; round-trips opaque to hex', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1])
    expect(parseColor('#0a6e80')).toEqual([10, 110, 128, 1])
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30, 0.5])
    expect(formatColor([10, 110, 128, 1])).toBe('#0a6e80')
  })
  it('computes WCAG contrast (white on black = 21)', () => {
    expect(Math.round(contrastRatio([255, 255, 255, 1], [0, 0, 0, 1]))).toBe(21)
  })
})

describe('blendPalette', () => {
  it('a single-weight blend equals that palette', () => {
    const a = solidPalette('#102030')
    const b = solidPalette('#ffffff')
    const out = blendPalette([a, b], [1, 0])
    expect(out['--bg0']).toBe('#102030')
  })
  it('a 50/50 black+white blend is mid-grey, and carries from the dominant', () => {
    const black = solidPalette('#000000', { '--font-display': 'BlackFont' })
    const white = solidPalette('#ffffff', { '--font-display': 'WhiteFont' })
    const out = blendPalette([black, white], [0.5, 0.5])
    const [r, g, b] = parseColor(out['--ink']!)!
    expect(r).toBeGreaterThan(120)
    expect(r).toBeLessThan(135)
    expect(g).toBe(r)
    expect(b).toBe(r)
    // carry key comes from one of the two (tie → first); not blended into a non-font value
    expect(['BlackFont', 'WhiteFont']).toContain(out['--font-display'])
  })
})

describe('nudgeForAA', () => {
  it('darkens muted text that is too close to a light card until it clears 4.5:1', () => {
    const p = solidPalette('#f4f0e8') // everything the same light colour → muted invisible on card
    p['--bg0'] = '#f4f0e8'
    p['--card'] = '#f4f0e8'
    p['--muted'] = '#e8e3da' // barely different
    const fixed = nudgeForAA(p)
    const muted = parseColor(fixed['--muted']!)!
    const card = parseColor(fixed['--card']!)!
    expect(contrastRatio(muted, card)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('computeSkinWeights', () => {
  it('skews to grimoire for a fantasy-tagged, loved library', () => {
    const books = [
      makeBook({ id: '1', title: 'A', subgenre: 'Romantasy', tags: ['Fae', 'Dragon Riders', 'Magic Academy'], rating: 5, fave: true, readStatus: 'Read' }),
      makeBook({ id: '2', title: 'B', subgenre: 'Romantasy', tags: ['Court Intrigue', 'Chosen One'], rating: 5, readStatus: 'Read' }),
    ]
    const w = computeSkinWeights(books)
    expect(dominantSkin(w)).toBe('grimoire')
    expect(w.grimoire).toBeGreaterThan(w.marrow)
    expect(tasteInsight(w)).toContain('fantasy')
  })
  it('lifts marrow for dark-romance tags', () => {
    const dark = computeSkinWeights([
      makeBook({ id: '1', title: 'A', subgenre: 'Dark Romance', tags: ['Mafia', 'Villain Romance', 'Obsessive'], rating: 5, fave: true, readStatus: 'Read' }),
    ])
    const cozy = computeSkinWeights([
      makeBook({ id: '2', title: 'B', subgenre: 'Romance', tags: ['Slow Burn', 'Small Town'], rating: 5, readStatus: 'Read' }),
    ])
    expect(dark.marrow).toBeGreaterThan(cozy.marrow)
  })
  it('weights are normalized and sum to 1', () => {
    const w = computeSkinWeights([makeBook({ id: '1', title: 'A' })])
    expect(w.reverie + w.grimoire + w.aphelion + w.marrow).toBeCloseTo(1, 5)
  })
})

describe('isMaterialShift (cron gate)', () => {
  const w = (reverie: number, grimoire: number, aphelion: number, marrow: number) => ({ reverie, grimoire, aphelion, marrow })

  it('is false for an unchanged / barely-nudged profile (idempotent + noise-proof)', () => {
    expect(isMaterialShift(w(0.6, 0.2, 0.1, 0.1), w(0.6, 0.2, 0.1, 0.1))).toBe(false)
    expect(isMaterialShift(w(0.6, 0.2, 0.1, 0.1), w(0.58, 0.22, 0.1, 0.1))).toBe(false)
  })
  it('is true when the dominant skin flips', () => {
    expect(isMaterialShift(w(0.5, 0.3, 0.1, 0.1), w(0.3, 0.5, 0.1, 0.1))).toBe(true)
  })
  it('is true when the weight vector moves past the threshold', () => {
    expect(weightDistance(w(0.6, 0.2, 0.1, 0.1), w(0.4, 0.2, 0.1, 0.3))).toBeCloseTo(0.4, 5)
    expect(isMaterialShift(w(0.6, 0.2, 0.1, 0.1), w(0.45, 0.2, 0.1, 0.25))).toBe(true)
  })
})
