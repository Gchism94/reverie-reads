import { describe, expect, it } from 'vitest'
import { buildMatchContext, MATCH_WEIGHTS, scoreMatch, type MatchProfile } from './matcher'
import { makeBook } from './book.fixture'

// Tier 0 matcher: normalized 0..100 scores, rarity-weighted tags, series momentum, honest
// novelty/quality (rereads love, DNF negative), and a structured reasons payload.

const profile: MatchProfile = {
  subWeights: { Romantasy: 3 },
  wantTags: ['Enemies to Lovers', 'Fae'],
  targetIntensity: 4,
}

describe('scoreMatch (Tier 0 vibe matcher)', () => {
  it('weights sum to 1 so the score reads as a percentage', () => {
    expect(Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })

  it('ranks an on-profile unread book above an off-profile read one, within 0..100', () => {
    const onProfile = makeBook({ id: 'a', title: 'Match', subgenre: 'Romantasy', tags: ['Enemies to Lovers', 'Fae'], intensity: 4, rating: 5, readStatus: 'Unread' })
    const offProfile = makeBook({ id: 'b', title: 'Miss', subgenre: 'Contemporary', tags: [], intensity: 1, rating: 0, readStatus: 'Read' })
    const hi = scoreMatch(onProfile, profile)
    const lo = scoreMatch(offProfile, profile)
    expect(hi.score).toBeGreaterThan(lo.score)
    expect(hi.score).toBeLessThanOrEqual(100)
    expect(lo.score).toBeGreaterThanOrEqual(0)
  })

  it('unknown intensity sits between a perfect fit and a bad fit (mild neutral, not a free pass)', () => {
    const perfect = scoreMatch(makeBook({ id: 'a', title: 'A', intensity: 4 }), profile).score
    const unknown = scoreMatch(makeBook({ id: 'b', title: 'B', intensity: null }), profile).score
    const bad = scoreMatch(makeBook({ id: 'c', title: 'C', intensity: 0 }), profile).score
    expect(unknown).toBeLessThan(perfect)
    expect(unknown).toBeGreaterThan(bad)
  })

  it('ignores intensity entirely when the reader has no preference (null target)', () => {
    const p: MatchProfile = { subWeights: {}, wantTags: [], targetIntensity: null }
    const spicy = scoreMatch(makeBook({ id: 'a', title: 'A', intensity: 5 }), p)
    const mild = scoreMatch(makeBook({ id: 'b', title: 'B', intensity: 0 }), p)
    expect(spicy.score).toBe(mild.score)
  })

  it('rarity-weights shared tags: a shared RARE tag outranks a shared ubiquitous one', () => {
    // Slow Burn on every library book; Locked Room on exactly one — sharing the rare tag says more.
    const library = [
      makeBook({ id: '1', title: 'L1', tags: ['Slow Burn'] }),
      makeBook({ id: '2', title: 'L2', tags: ['Slow Burn'] }),
      makeBook({ id: '3', title: 'L3', tags: ['Slow Burn'] }),
      makeBook({ id: '4', title: 'L4', tags: ['Slow Burn', 'Locked Room'] }),
    ]
    const ctx = buildMatchContext(library)
    const p: MatchProfile = { subWeights: {}, wantTags: ['Slow Burn', 'Locked Room'], targetIntensity: null }
    const rare = scoreMatch(makeBook({ id: 'r', title: 'R', tags: ['Locked Room'] }), p, ctx)
    const common = scoreMatch(makeBook({ id: 'c', title: 'C', tags: ['Slow Burn'] }), p, ctx)
    expect(rare.score).toBeGreaterThan(common.score)
    expect(rare.reasons.find((x) => x.key === 'tags')?.matchedTags).toEqual(['Locked Room'])
  })

  it('tag matching is case-insensitive', () => {
    const p: MatchProfile = { subWeights: {}, wantTags: ['enemies to lovers'], targetIntensity: null }
    const b = makeBook({ id: 'a', title: 'A', tags: ['Enemies to Lovers'] })
    expect(scoreMatch(b, p).reasons.find((x) => x.key === 'tags')?.value).toBe(1)
  })

  it('series momentum: the next book of a LOVED series beats the same book unloved or unstarted', () => {
    const loved = buildMatchContext([
      makeBook({ id: '1', title: 'Book 1', series: 'S', position: 1, readStatus: 'Read', rating: 5 }),
    ])
    const meh = buildMatchContext([
      makeBook({ id: '1', title: 'Book 1', series: 'S', position: 1, readStatus: 'Read', rating: 3 }),
    ])
    const none = buildMatchContext([])
    const p: MatchProfile = { subWeights: {}, wantTags: [], targetIntensity: null }
    const book2 = makeBook({ id: '2', title: 'Book 2', series: 'S', position: 2, readStatus: 'Unread' })
    const sLoved = scoreMatch(book2, p, loved)
    const sMeh = scoreMatch(book2, p, meh)
    const sNone = scoreMatch(book2, p, none)
    expect(sLoved.score).toBeGreaterThan(sMeh.score)
    expect(sMeh.score).toBeGreaterThan(sNone.score)
    expect(sLoved.reasons.find((x) => x.key === 'series')?.series?.lovedEarlier).toBe(true)
    // and an UNSTARTED series' book 2 is suppressed below a standalone
    const standalone = scoreMatch(makeBook({ id: 's', title: 'Solo', readStatus: 'Unread' }), p, none)
    expect(sNone.score).toBeLessThan(standalone.score)
  })

  it('DNF is a real negative — no more accidental unread bonus', () => {
    const p: MatchProfile = { subWeights: {}, wantTags: [], targetIntensity: null }
    const dnf = scoreMatch(makeBook({ id: 'd', title: 'D', readStatus: 'DNF' }), p)
    const unread = scoreMatch(makeBook({ id: 'u', title: 'U', readStatus: 'Unread' }), p)
    const read = scoreMatch(makeBook({ id: 'r', title: 'R', readStatus: 'Read' }), p)
    expect(dnf.score).toBeLessThan(read.score)
    expect(read.score).toBeLessThan(unread.score)
  })

  it('rereads are a love signal on quality, not just "already read"', () => {
    const p: MatchProfile = { subWeights: {}, wantTags: [], targetIntensity: null }
    const reads = [
      { date: '2025-01-01', format: 'ebook', rating: 0, notes: '' },
      { date: '2025-06-01', format: 'ebook', rating: 0, notes: '' },
    ]
    const rereader = scoreMatch(makeBook({ id: 'a', title: 'A', readStatus: 'Read', rating: 4, reads }), p)
    const onceRead = scoreMatch(makeBook({ id: 'b', title: 'B', readStatus: 'Read', rating: 4 }), p)
    expect(rereader.score).toBeGreaterThan(onceRead.score)
  })

  it('applies the optional skin signature (archetype) via context, neutral without it', () => {
    const b = makeBook({ id: 'a', title: 'A', tags: ['Mafia'] })
    const p = { ...profile, archetypeWeights: { mafia: 5 } }
    const withSig = scoreMatch(b, p, { tagRarity: {}, series: {}, archetype: () => 'mafia' })
    const without = scoreMatch(b, p)
    expect(withSig.score).toBeGreaterThan(without.score)
  })

  it('returns reasons sorted by contribution with every component present', () => {
    const b = makeBook({ id: 'a', title: 'A', subgenre: 'Romantasy', tags: ['Fae'], intensity: 4 })
    const { reasons } = scoreMatch(b, profile)
    expect(reasons).toHaveLength(7)
    for (let i = 1; i < reasons.length; i++) {
      expect(reasons[i - 1]!.contribution).toBeGreaterThanOrEqual(reasons[i]!.contribution)
    }
  })
})
