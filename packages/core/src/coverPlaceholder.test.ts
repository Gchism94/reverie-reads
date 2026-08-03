import { describe, expect, it } from 'vitest'
import {
  accentCss,
  monogram,
  placeholderSpec,
  PLACEHOLDER_ACCENT_RECIPES,
  PLACEHOLDER_ACCENTS,
} from './coverPlaceholder'

describe('monogram', () => {
  it('takes the first two significant words, skipping articles', () => {
    expect(monogram('A Court of Thorns and Roses')).toBe('CT') // skip a/of/and → Court, Thorns
    expect(monogram('Fourth Wing')).toBe('FW')
    expect(monogram('The Serpent and the Wings of Night')).toBe('SW') // Serpent, Wings
  })
  it('handles one-word, punctuation, and empty titles', () => {
    expect(monogram('Obsession')).toBe('O')
    expect(monogram('  the   ')).toBe('T') // only an article → falls back to all words
    expect(monogram('')).toBe('✦')
    expect(monogram('!!!')).toBe('✦')
  })
})

describe('placeholderSpec', () => {
  it('builds the author from first/last and a monogram from the title', () => {
    const s = placeholderSpec({ title: 'Fourth Wing', first: 'Rebecca', last: 'Yarros' })
    expect(s).toMatchObject({ title: 'Fourth Wing', author: 'Rebecca Yarros', initials: 'FW' })
    expect(PLACEHOLDER_ACCENT_RECIPES).toContainEqual(s.accent)
  })
  it('picks an accent deterministically (stable per book) and only from the recipe registry', () => {
    const a = placeholderSpec({ title: 'Twisted Love' }).accent
    const b = placeholderSpec({ title: 'Twisted Love' }).accent
    expect(a).toEqual(b) // stable across calls
    expect(PLACEHOLDER_ACCENT_RECIPES).toContainEqual(a) // always an on-skin recipe
  })
  it('folds the author into the accent key — two same-titled books can stop sharing a plate', () => {
    // A single pair can legally collide (10 recipes), so one inequality would be flaky-by-design.
    // The falsifiable form: across 26 authors of the same title, at least one accent must differ
    // from the authorless one. If the author is dropped from the hash key, ALL 26 equal it by
    // construction and this fails — the mutation this test exists to catch. (All 26 colliding by
    // chance with the author IN the key is (1/10)^26 — not a real flake risk.)
    const base = placeholderSpec({ title: 'Bunny' }).accent
    const variants = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      .split('')
      .map((ch) => placeholderSpec({ title: 'Bunny', first: ch, last: 'Author' }).accent)
    expect(variants.some((v) => JSON.stringify(v) !== JSON.stringify(base))).toBe(true)
    // And the same (title, author) never differs from itself.
    expect(placeholderSpec({ title: 'Bunny', first: 'A', last: 'Author' }).accent).toEqual(
      variants[0],
    )
  })
  it('tolerates a missing title/author', () => {
    const s = placeholderSpec({})
    expect(s.title).toBe('')
    expect(s.author).toBe('')
    expect(s.initials).toBe('✦')
  })
})

describe('the accent recipe space', () => {
  it('is exactly the 4 pure tokens plus the 6 pairwise 50/50 blends', () => {
    expect(PLACEHOLDER_ACCENT_RECIPES).toHaveLength(10)
    const pure = PLACEHOLDER_ACCENT_RECIPES.filter((r) => !r.b)
    expect(pure.map((r) => r.a)).toEqual([...PLACEHOLDER_ACCENTS])
    const blends = PLACEHOLDER_ACCENT_RECIPES.filter((r) => r.b)
    expect(blends).toHaveLength(6)
    // No blend pairs a token with itself, and no pair repeats.
    const keys = blends.map((r) => `${r.a}|${r.b}`)
    expect(new Set(keys).size).toBe(6)
    for (const r of blends) expect(r.a).not.toBe(r.b)
  })
  it('accentCss renders a bare var for pure recipes and a color-mix for blends', () => {
    expect(accentCss({ a: '--gold' })).toBe('var(--gold)')
    expect(accentCss({ a: '--violet', b: '--blue' })).toBe(
      'color-mix(in srgb, var(--violet) 50%, var(--blue))',
    )
  })
})
