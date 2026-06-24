import { describe, expect, it } from 'vitest'
import { deriveBoyfriend } from './boyfriend'

describe('deriveBoyfriend', () => {
  it('maps tropes to archetypes (first match wins)', () => {
    expect(deriveBoyfriend({ tropes: ['Mafia'] })).toBe('mafia')
    expect(deriveBoyfriend({ tropes: ['Fae'] })).toBe('fae')
    expect(deriveBoyfriend({ tropes: ['Dragon Riders'] })).toBe('dragon')
    expect(deriveBoyfriend({ tropes: ['Friends to Lovers'] })).toBe('cinnamon')
    expect(deriveBoyfriend({ tropes: ['Enemies to Lovers'] })).toBe('rogue')
  })

  it('falls back to subgenre when no trope matches', () => {
    expect(deriveBoyfriend({ tropes: [], subgenre: 'Romantasy' })).toBe('gray')
    expect(deriveBoyfriend({ tropes: [], subgenre: 'Dark Romance' })).toBe('villain')
    expect(deriveBoyfriend({ tropes: [] })).toBe('cinnamon')
  })

  it('dark romance suppresses the cinnamon-roll path', () => {
    // "found family" would be cinnamon, but Dark Romance routes to villain.
    expect(deriveBoyfriend({ tropes: ['Found Family'], subgenre: 'Dark Romance' })).toBe('villain')
  })
})
