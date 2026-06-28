import { describe, expect, it } from 'vitest'
import { monogram, placeholderSpec, PLACEHOLDER_ACCENTS } from './coverPlaceholder'

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
    expect(PLACEHOLDER_ACCENTS).toContain(s.accentVar)
  })
  it('picks an accent deterministically (stable per book) and only from the skin palette', () => {
    const a = placeholderSpec({ title: 'Twisted Love' }).accentVar
    const b = placeholderSpec({ title: 'Twisted Love' }).accentVar
    expect(a).toBe(b) // stable across calls
    expect(PLACEHOLDER_ACCENTS).toContain(a) // always an on-skin token
  })
  it('tolerates a missing title/author', () => {
    const s = placeholderSpec({})
    expect(s.title).toBe('')
    expect(s.author).toBe('')
    expect(s.initials).toBe('✦')
  })
})
