import { describe, expect, it } from 'vitest'
import { scoreMatch, type MatchProfile } from './matcher'
import { makeBook } from './book.fixture'

describe('scoreMatch (genre-agnostic vibe matcher)', () => {
  const profile: MatchProfile = {
    subWeights: { Romantasy: 3 },
    wantTags: ['Enemies to Lovers', 'Fae'],
    targetIntensity: 4,
  }

  it('ranks an on-profile unread book above an off-profile read one', () => {
    const onProfile = makeBook({ id: 'a', title: 'Match', subgenre: 'Romantasy', tags: ['Enemies to Lovers', 'Fae'], intensity: 4, rating: 5, readStatus: 'Unread' })
    const offProfile = makeBook({ id: 'b', title: 'Miss', subgenre: 'Contemporary', tags: [], intensity: 1, rating: 0, readStatus: 'Read' })
    expect(scoreMatch(onProfile, profile)).toBeGreaterThan(scoreMatch(offProfile, profile))
  })

  it('treats unknown intensity as neutral (no penalty), not a genre guess', () => {
    const known = makeBook({ id: 'a', title: 'A', intensity: 4 })
    const unknown = makeBook({ id: 'b', title: 'B', intensity: null })
    // With targetIntensity 4, a null-intensity book gets no intensity penalty either way.
    expect(scoreMatch(unknown, profile)).toBe(scoreMatch(known, profile))
  })

  it('applies an optional skin signature (archetype) without coupling to romance in core', () => {
    const b = makeBook({ id: 'a', title: 'A', tags: ['Mafia'] })
    const withSig = scoreMatch(b, { ...profile, archetypeWeights: { mafia: 5 } }, { archetype: () => 'mafia' })
    const without = scoreMatch(b, profile)
    expect(withSig).toBeGreaterThan(without)
  })

  it('ignores intensity entirely when the reader has no preference (null target)', () => {
    const p: MatchProfile = { subWeights: {}, wantTags: [], targetIntensity: null }
    const spicy = makeBook({ id: 'a', title: 'A', intensity: 5 })
    const mild = makeBook({ id: 'b', title: 'B', intensity: 0 })
    expect(scoreMatch(spicy, p)).toBe(scoreMatch(mild, p))
  })
})
