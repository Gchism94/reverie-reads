import { describe, expect, it } from 'vitest'
import { canonicalTag } from './tags'

describe('canonicalTag', () => {
  it('collapses formatting variants and shorthands onto the canonical name', () => {
    expect(canonicalTag('e2l')).toBe('Enemies to Lovers')
    expect(canonicalTag('Enemies-to-Lovers')).toBe('Enemies to Lovers')
    expect(canonicalTag('grumpy   sunshine')).toBe('Grumpy/Sunshine')
    expect(canonicalTag('slowburn')).toBe('Slow Burn')
    expect(canonicalTag('RH')).toBe('Reverse Harem')
  })

  it('converges case-insensitively on a known vocabulary without forcing case on new tags', () => {
    const known = ['Enemies to Lovers', 'Locked Room', 'Found Family']
    expect(canonicalTag('locked room', known)).toBe('Locked Room')
    expect(canonicalTag('FOUND FAMILY', known)).toBe('Found Family')
    // a genuinely new user tag passes through cleaned, exactly as typed
    expect(canonicalTag('  sapphic   pirates ', known)).toBe('sapphic pirates')
  })

  it('keeps near-neighbours distinct (aliases are synonyms only, not clustering)', () => {
    expect(canonicalTag('Rivals to Lovers')).toBe('Rivals to Lovers')
  })

  it('returns empty for whitespace-only input', () => {
    expect(canonicalTag('   ')).toBe('')
  })
})
