import { describe, expect, it } from 'vitest'
import { claimedSeriesLength, seriesNameKey } from './seriesIndex'

// The Tier 1 normalization key, held against the ELEVEN candidate sets Phase 1 found in production
// rather than against invented examples. The discriminating fact this table exists to protect: one
// initialism link was real and nine of ten prefix links were noise, so a rule that collapses more
// than "the same name written differently" destroys distinctions the reader actually made.
//
// A collapse here is AUTOMATIC and silent (getOrCreateSeries consults it before minting a row), so
// a false collapse is not a suggestion the reader can decline — it is two series becoming one page
// with no prompt. That asymmetry is why the must-not list is longer than the must list.

describe('seriesNameKey — what it MUST collapse', () => {
  it('the suffix variant that is the same name written twice', () => {
    // The one real normalization duplicate in production (the other real pair is an initialism,
    // which is deliberately NOT this function's job — see below).
    expect(seriesNameKey('The Freckled Fate')).toBe(seriesNameKey('The Freckled Fate Series'))
  })

  it('article and punctuation and case differences', () => {
    expect(seriesNameKey('the empyrean')).toBe(seriesNameKey('The Empyrean'))
    expect(seriesNameKey("The Kindred's Curse")).toBe(seriesNameKey('The Kindreds Curse'))
    expect(seriesNameKey('A Court of Thorns and Roses')).toBe(
      seriesNameKey('a court of thorns and roses'),
    )
    // article + suffix together, both stripped
    expect(seriesNameKey('The Ever Seas')).toBe(seriesNameKey('Ever Seas Series'))
  })
})

describe('seriesNameKey — what it MUST NOT collapse', () => {
  // Each of these is a real production pair the audit surfaced and a human ruled distinct. They are
  // listed individually rather than as a loop so a failure names the pair it broke.
  it('three unrelated series sharing a prefix', () => {
    const legend = seriesNameKey('Legend')
    expect(legend).not.toBe(seriesNameKey('The Legendborn Cycle'))
    expect(legend).not.toBe(seriesNameKey('The Legends of Thezmarr'))
    expect(seriesNameKey('The Legendborn Cycle')).not.toBe(seriesNameKey('The Legends of Thezmarr'))
  })

  it('Ravenhood Legacy vs The Ravenhood — adjudicated distinct during the backfill review', () => {
    expect(seriesNameKey('Ravenhood Legacy')).not.toBe(seriesNameKey('The Ravenhood'))
  })

  // SIBLING series in a shared universe: not duplicates and not unrelated. Fifty Shades as Told by
  // Christian is the same events from another POV. PR 2's decision table needs a third outcome
  // (related-but-separate) for these; what matters HERE is only that they never auto-collapse.
  it('sibling series in a shared universe', () => {
    expect(seriesNameKey('Sinners')).not.toBe(seriesNameKey('Sinners and Saints'))
    expect(seriesNameKey('Mountain Men')).not.toBe(seriesNameKey('Mountain Men Matchmaker'))
    expect(seriesNameKey('Fifty Shades')).not.toBe(
      seriesNameKey('Fifty Shades as Told by Christian'),
    )
    expect(seriesNameKey('Fifty Shades')).not.toBe(seriesNameKey('Fifty Shades of Grey'))
  })

  it('only "Series" is a strippable suffix — not Saga, Cycle, Trilogy, Chronicles', () => {
    // "Series" is a generic descriptor readers append inconsistently; the others are usually part
    // of the real title. Stripping Saga would collapse a pair nobody has adjudicated.
    expect(seriesNameKey("The Kindred's Curse")).not.toBe(seriesNameKey("The Kindred's Curse Saga"))
    expect(seriesNameKey('Legend')).not.toBe(seriesNameKey('Legend Cycle'))
    expect(seriesNameKey('Wax and Wayne')).not.toBe(seriesNameKey('Wax and Wayne Trilogy'))
  })

  it('an initialism is NOT normalization — ACOTAR stays separate (Tier 3, a queued proposal)', () => {
    // The real duplicate the screenshots reported, and this function deliberately does not fix it:
    // collapsing an initialism automatically is an identity judgment made without asking.
    expect(seriesNameKey('ACOTAR')).not.toBe(seriesNameKey('A Court of Thorns and Roses'))
  })
})

describe('seriesNameKey — shape', () => {
  it('strips exactly ONE leading article', () => {
    // "The The Hunger Games" is an odd name, not two articles to peel.
    expect(seriesNameKey('The The Hunger Games')).toBe('thehungergames')
  })

  it('is idempotent and total', () => {
    const k = seriesNameKey('The Freckled Fate Series')
    expect(seriesNameKey(k)).toBe(k)
    expect(seriesNameKey('')).toBe('')
    expect(seriesNameKey('   ')).toBe('')
    expect(seriesNameKey('!!!')).toBe('')
  })
})

describe('claimedSeriesLength — deterministic under member disagreement', () => {
  const b = (seriesCount: number | null) => ({ seriesCount })

  it('takes the MAX when members disagree, not whichever came first', () => {
    // The production shape: A Court of Thorns and Roses had three members carrying counts, max 7,
    // and displayed "6 in all" because the array handed over a 6 first.
    expect(claimedSeriesLength([b(6), b(7), b(5)])).toBe(7)
  })

  it('is stable across fetch order — the defect was order-dependence, not the value', () => {
    const members = [b(6), b(7), b(5), b(null)]
    const forward = claimedSeriesLength(members)
    const reversed = claimedSeriesLength([...members].reverse())
    const shuffled = claimedSeriesLength([members[3]!, members[1]!, members[0]!, members[2]!])
    expect(forward).toBe(reversed)
    expect(forward).toBe(shuffled)
  })

  it('ignores nulls, and answers null when no member claims a length', () => {
    expect(claimedSeriesLength([b(null), b(4), b(null)])).toBe(4)
    expect(claimedSeriesLength([b(null), b(null)])).toBeNull()
    expect(claimedSeriesLength([])).toBeNull()
  })
})
