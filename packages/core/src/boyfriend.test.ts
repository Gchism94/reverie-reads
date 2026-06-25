import { describe, expect, it } from 'vitest'
import { deriveBoyfriend } from './boyfriend'

describe('deriveBoyfriend', () => {
  it('maps tropes to archetypes (first match wins)', () => {
    expect(deriveBoyfriend({ tags: ['Mafia'] })).toBe('mafia')
    expect(deriveBoyfriend({ tags: ['Fae'] })).toBe('fae')
    expect(deriveBoyfriend({ tags: ['Dragon Riders'] })).toBe('dragon')
    expect(deriveBoyfriend({ tags: ['Friends to Lovers'] })).toBe('cinnamon')
    expect(deriveBoyfriend({ tags: ['Enemies to Lovers'] })).toBe('rogue')
  })

  it('falls back to subgenre when no trope matches', () => {
    expect(deriveBoyfriend({ tags: [], subgenre: 'Romantasy' })).toBe('gray')
    expect(deriveBoyfriend({ tags: [], subgenre: 'Dark Romance' })).toBe('villain')
    expect(deriveBoyfriend({ tags: [] })).toBe('cinnamon')
  })

  it('dark romance suppresses the cinnamon-roll path', () => {
    // "found family" would be cinnamon, but Dark Romance routes to villain.
    expect(deriveBoyfriend({ tags: ['Found Family'], subgenre: 'Dark Romance' })).toBe('villain')
  })
})
