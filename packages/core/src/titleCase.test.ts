import { describe, expect, it } from 'vitest'
import { titleCase } from './titleCase'
import { SEED_TROPES } from './tropes'

describe('titleCase', () => {
  it('capitalizes each word', () => {
    expect(titleCase('forced proximity')).toBe('Forced Proximity')
    expect(titleCase('he falls first')).toBe('He Falls First')
  })

  it('leaves minor words lowercase in the middle — the way SEED_TROPES is authored', () => {
    expect(titleCase('enemies to lovers')).toBe('Enemies to Lovers')
    expect(titleCase('descent into madness')).toBe('Descent into Madness')
    expect(titleCase('marriage of convenience')).toBe('Marriage of Convenience')
    expect(titleCase('touch her and die')).toBe('Touch Her and Die')
    expect(titleCase('marriage in trouble')).toBe('Marriage in Trouble')
  })

  it('always capitalizes the FIRST word, even when it is a minor one', () => {
    // A name that starts lowercase reads as a mistake rather than as a style.
    expect(titleCase('of mice and men')).toBe('Of Mice and Men')
    expect(titleCase('the long game')).toBe('The Long Game')
  })

  it('folds all-caps input — shouting is not an acronym the reader chose', () => {
    expect(titleCase('ENEMIES TO LOVERS')).toBe('Enemies to Lovers')
  })

  it('preserves interior capitals the reader typed', () => {
    // Only the first character is forced, so these survive instead of being flattened.
    expect(titleCase('the mcGuffin problem')).toBe('The McGuffin Problem')
    expect(titleCase("d'Arcy returns")).toBe("D'Arcy Returns")
  })

  it('does not split on interior punctuation', () => {
    // 'Grumpy/Sunshine' is a real seed entry; splitting on `/` would invent a rule the vocabulary
    // does not have.
    expect(titleCase('grumpy/sunshine')).toBe('Grumpy/sunshine')
  })

  it('normalizes whitespace and survives empty input', () => {
    expect(titleCase('  slow   burn  ')).toBe('Slow Burn')
    expect(titleCase('')).toBe('')
    expect(titleCase('   ')).toBe('')
  })

  /**
   * The claim this helper is built on, asserted against the real vocabulary rather than against the
   * handful of examples in its own doc comment: a seed name, lowercased and fed back through
   * titleCase, should come out as it was authored.
   *
   * Not every entry can round-trip — 'Grumpy/Sunshine' cannot, since the interior capital is lost
   * by lowercasing and this deliberately does not split on `/`. So the assertion is on the
   * whitespace-delimited majority, and the exceptions are listed rather than hidden behind a
   * percentage.
   */
  it('round-trips the seed vocabulary (except the documented punctuation cases)', () => {
    // ACRONYMS cannot round-trip either, and that is a property of the round trip rather than of
    // the helper: lowercasing 'MMC' destroys information no capitalization rule can restore. Named
    // explicitly so the exclusion list stays a short, readable set of known cases rather than a
    // regex that quietly grows to cover whatever fails next.
    const CANNOT_ROUND_TRIP = new Set(['Morally Gray MMC', 'Morally Black MMC', 'AI & Androids'])
    const misses = SEED_TROPES.map((t) => t.name)
      .filter((name) => !/[/-]/.test(name)) // interior punctuation: excluded, see above
      .filter((name) => !CANNOT_ROUND_TRIP.has(name))
      .filter((name) => titleCase(name.toLowerCase()) !== name)
    expect(misses, `seed names that do not round-trip: ${misses.join(', ')}`).toEqual([])
  })
})
