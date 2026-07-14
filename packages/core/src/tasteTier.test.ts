import { describe, expect, it } from 'vitest'
import { SKINS, type SkinId } from './skins'
import {
  calibratedBand,
  NEUTRAL_TASTE_TIERS,
  TASTE_TIERS,
  TASTE_TIER_BOUNDS,
  TASTE_TIER_LABELS,
  tasteTierIndex,
  tasteTierLabel,
  tastePercentAnchored,
} from './tasteTier'

// Anchors modelled on the observed real-data band (lo≈0.894 p10-all, hi≈0.930 p75-loved).
const A = { lo: 0.894, hi: 0.93 }

describe('calibratedBand — fixed-anchor map, stable per book across shelves', () => {
  it('maps the anchors to 0 and 1 and clamps beyond them', () => {
    expect(calibratedBand(0.894, A)).toBe(0)
    expect(calibratedBand(0.93, A)).toBe(1)
    expect(calibratedBand(0.8, A)).toBe(0) // below the floor clamps to 0
    expect(calibratedBand(0.99, A)).toBe(1) // above the top clamps to 1
    expect(calibratedBand(0.912, A)).toBeCloseTo(0.5, 1) // midpoint
  })

  it('is a pure function of the cosine + anchors — same input, same band (shelf-independent)', () => {
    expect(calibratedBand(0.92, A)).toBe(calibratedBand(0.92, A))
  })

  it('guards the degenerate/sparse band (hi <= lo) — no divide-by-zero, always a valid [0,1]', () => {
    // The RPC keeps hi strictly > lo (hi := lo + 0.02 when the loved percentile is null/≤ lo), so this
    // shouldn't reach the client — but the map must never blow up if it does.
    for (const bad of [
      { lo: 0.9, hi: 0.9 }, // hi == lo (uniform library)
      { lo: 0.9, hi: 0.85 }, // hi < lo (inverted)
      { lo: 0.9, hi: Number.NaN }, // hi missing
    ]) {
      for (const cos of [0.8, 0.9, 0.95]) {
        const b = calibratedBand(cos, bad)
        expect(b).toBeGreaterThanOrEqual(0)
        expect(b).toBeLessThanOrEqual(1)
      }
      expect(tasteTierIndex(0.99, bad)).toBeGreaterThanOrEqual(0) // still returns a valid tier, no throw
    }
  })
})

describe('tasteTierIndex — four absolute tiers over the band', () => {
  it('assigns tiers by the absolute band boundaries, not quantiles of the input', () => {
    expect(tasteTierIndex(0.93, A)).toBe(0) // band 1.00 → recognition
    expect(tasteTierIndex(0.921, A)).toBe(0) // band exactly 0.75 → recognition (inclusive top boundary)
    expect(tasteTierIndex(0.918, A)).toBe(1) // band ~0.67 → belonging
    expect(tasteTierIndex(0.912, A)).toBe(1) // band 0.50 → belonging
    expect(tasteTierIndex(0.906, A)).toBe(2) // band ~0.33 → adjacency
    expect(tasteTierIndex(0.903, A)).toBe(2) // band 0.25 → adjacency (inclusive boundary)
    expect(tasteTierIndex(0.894, A)).toBe(3) // band 0 → departure
    expect(tasteTierIndex(0.7, A)).toBe(3) // far below floor → departure (still "worth trying")
  })

  it('boundaries are the even-quarter split of the calibrated band', () => {
    expect(TASTE_TIER_BOUNDS).toEqual([0.75, 0.5, 0.25])
    expect(TASTE_TIERS).toEqual(['recognition', 'belonging', 'adjacency', 'departure'])
  })

  it('the SAME cosine yields the SAME tier regardless of what else is on the shelf', () => {
    // no neighbours are consulted — the function takes only (cos, anchors)
    const cos = 0.917
    expect(tasteTierIndex(cos, A)).toBe(tasteTierIndex(cos, A))
  })
})

describe('tastePercentAnchored — the drill-down number (band ×100, 1–99)', () => {
  it('is the calibrated band as a percent, clamped to 1..99', () => {
    expect(tastePercentAnchored(0.93, A)).toBe(99)
    expect(tastePercentAnchored(0.894, A)).toBe(1)
    expect(tastePercentAnchored(0.912, A)).toBe(50)
  })
})

describe('per-skin tier vocabulary', () => {
  it('every skin in the registry has a four-tier set (a new skin fails loudly here)', () => {
    for (const skin of Object.keys(SKINS) as SkinId[]) {
      const set = TASTE_TIER_LABELS[skin]
      expect(set, `skin ${skin} is missing taste tier labels`).toBeDefined()
      expect(set).toHaveLength(4)
      for (const label of set) expect(label.length).toBeGreaterThan(0)
    }
  })

  it('resolves a label by skin + tier index, falling back to neutral for adaptive/unknown', () => {
    expect(tasteTierLabel('aphelion', 0)).toBe('Dead center')
    expect(tasteTierLabel('aphelion', 3)).toBe('Deep space')
    expect(tasteTierLabel('tryst', 0)).toBe('Made for you')
    expect(tasteTierLabel('adaptive', 0)).toBe(NEUTRAL_TASTE_TIERS[0])
    expect(tasteTierLabel('not-a-skin', 2)).toBe(NEUTRAL_TASTE_TIERS[2])
  })

  it('the floor tier is never dismissive (a departure worth trying)', () => {
    for (const skin of Object.keys(SKINS) as SkinId[]) {
      const floor = TASTE_TIER_LABELS[skin][3].toLowerCase()
      expect(floor).not.toMatch(/not for you|dislike|bad match|avoid/)
    }
  })
})
