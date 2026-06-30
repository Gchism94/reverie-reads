import { describe, expect, it } from 'vitest'
import { fitSpineTitle, spineDims } from './spine'

describe('spineDims — stable, varied, never uniform (no page/trim data)', () => {
  it('is deterministic per seed', () => {
    expect(spineDims('book-1')).toEqual(spineDims('book-1'))
  })
  it('stays in 0..1 and varies book-to-book', () => {
    const a = spineDims('book-1')
    const b = spineDims('book-2')
    for (const d of [a, b]) {
      expect(d.thickness).toBeGreaterThanOrEqual(0)
      expect(d.thickness).toBeLessThanOrEqual(1)
      expect(d.trim).toBeGreaterThanOrEqual(0)
      expect(d.trim).toBeLessThanOrEqual(1)
    }
    expect(a).not.toEqual(b)
  })
  it('does not collapse to one value across many books', () => {
    const widths = new Set(Array.from({ length: 40 }, (_, i) => spineDims(`b${i}`).thickness.toFixed(3)))
    expect(widths.size).toBeGreaterThan(20) // plenty of distinct widths
  })
})

describe('fitSpineTitle — scale-to-fit, floor, then truncate', () => {
  it('a short title gets the max size and full text', () => {
    const r = fitSpineTitle('Lure', 300, { min: 13, max: 22 })
    expect(r.fontPx).toBe(22)
    expect(r.text).toBe('Lure')
    expect(r.truncated).toBe(false)
  })
  it('a longer title shrinks but stays >= the floor and keeps full text when it fits', () => {
    const r = fitSpineTitle('The Lamplighter’s Unspoken Promise', 300)
    expect(r.fontPx).toBeGreaterThanOrEqual(13)
    expect(r.fontPx).toBeLessThan(22)
  })
  it('a monster title floors at min size AND truncates with an ellipsis (never overflows)', () => {
    const monster = 'The Exhaustively Complete and Unabridged Chronicle of Everything That Ever Happened, Volume One: A Subtitle'
    const avail = 240
    const r = fitSpineTitle(monster, avail, { min: 13, max: 22, charRatio: 0.62 })
    expect(r.fontPx).toBe(13) // hit the floor
    expect(r.truncated).toBe(true)
    expect(r.text.endsWith('…')).toBe(true)
    // and it actually fits: rendered length * (font * ratio) <= avail
    expect(r.text.length * (r.fontPx * 0.62)).toBeLessThanOrEqual(avail + 1)
  })
})
