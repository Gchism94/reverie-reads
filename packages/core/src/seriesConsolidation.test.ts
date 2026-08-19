import { describe, expect, it } from 'vitest'
import {
  canonicalPairKeys,
  initialismOf,
  isInitialismPair,
  pickPrimary,
  proposeConsolidation,
  type ConsolidationSeries,
  type DecidedSeriesPair,
} from './seriesConsolidation'

// The fixtures are Phase 1's own production sets (docs/tasks/task-series-consolidation.md): the
// two real duplicates and the prefix-linked false positives the tier model exists to NOT propose.
// If a change here makes a Sinners-shaped pair propose, the tier boundary broke, whatever the
// diff looks like.

const S = (id: string, name: string, liveEntries = 0, memberBooks = 0): ConsolidationSeries => ({
  id,
  name,
  liveEntries,
  memberBooks,
})

const D = (
  nameKeyA: string,
  nameKeyB: string,
  ruling: DecidedSeriesPair['ruling'] = 'distinct',
): DecidedSeriesPair => ({ nameKeyA, nameKeyB, ruling })

describe('initialism matching — the ONLY Tier 3 signal, deliberately narrow', () => {
  it('ACOTAR ↔ A Court of Thorns and Roses — the archetype, articles and conjunctions counted', () => {
    expect(initialismOf('A Court of Thorns and Roses')).toBe('acotar')
    expect(isInitialismPair('ACOTAR', 'A Court of Thorns and Roses')).toBe(true)
    expect(isInitialismPair('A Court of Thorns and Roses', 'ACOTAR')).toBe(true)
  })

  it('TOG ↔ Throne of Glass — the three-letter floor is inclusive', () => {
    expect(isInitialismPair('TOG', 'Throne of Glass')).toBe(true)
  })

  it('refuses every prefix-shaped Phase 1 false positive — both sides multi-word', () => {
    expect(isInitialismPair('Sinners', 'Sinners and Saints')).toBe(false)
    expect(isInitialismPair('Mountain Men', 'Mountain Men Matchmaker')).toBe(false)
    expect(isInitialismPair('Fifty Shades', 'Fifty Shades as Told by Christian')).toBe(false)
    expect(isInitialismPair('Legend', 'The Legendborn Cycle')).toBe(false)
  })

  it('refuses a two-letter initialism and a two-word long side', () => {
    expect(isInitialismPair('MM', 'Mountain Men')).toBe(false)
  })

  it('demands exact equality, not prefix or containment', () => {
    expect(isInitialismPair('ACOTARS', 'A Court of Thorns and Roses')).toBe(false)
    expect(isInitialismPair('ACOT', 'A Court of Thorns and Roses')).toBe(false)
  })
})

describe('the primary pick — cargo stays put', () => {
  it('more live entries wins, whichever argument order', () => {
    const heavy = S('b', 'A Court of Thorns and Roses', 7, 3)
    const light = S('a', 'ACOTAR', 1, 1)
    expect(pickPrimary(heavy, light).primary).toBe(heavy)
    expect(pickPrimary(light, heavy).primary).toBe(heavy)
  })

  it('entry tie falls to member books, then to the shorter name (the un-suffixed variant)', () => {
    expect(pickPrimary(S('a', 'X', 2, 5), S('b', 'Y', 2, 3)).primary.id).toBe('a')
    const short = S('a', 'The Freckled Fate', 0, 0)
    const long = S('b', 'The Freckled Fate Series', 0, 0)
    expect(pickPrimary(long, short).primary).toBe(short)
  })

  it('full tie falls to the smaller id — stable, not meaningful', () => {
    expect(pickPrimary(S('b', 'X', 0, 0), S('a', 'X', 0, 0)).primary.id).toBe('a')
  })
})

describe('proposeConsolidation — tiers, and what is never proposed', () => {
  it('Tier 2: identical name keys propose an automatic merge (The Freckled Fate pilot)', () => {
    const rows = [S('a', 'The Freckled Fate', 4, 4), S('b', 'The Freckled Fate Series', 0, 1)]
    const out = proposeConsolidation(rows, [])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ tier: 2, primary: { id: 'a' }, loser: { id: 'b' } })
    expect(out[0]!.nameKeyA).toBe(out[0]!.nameKeyB)
  })

  it('Tier 3: the initialism pair proposes, queued not automatic (ACOTAR pilot)', () => {
    const rows = [S('a', 'ACOTAR', 1, 1), S('b', 'A Court of Thorns and Roses', 7, 3)]
    const out = proposeConsolidation(rows, [])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ tier: 3, primary: { id: 'b' }, loser: { id: 'a' } })
  })

  it('Tier 4 does not exist: none of the nine prefix sets yields any candidate', () => {
    const rows = [
      S('a', 'Sinners'),
      S('b', 'Sinners and Saints'),
      S('c', 'Mountain Men'),
      S('d', 'Mountain Men Matchmaker'),
      S('e', 'Legend'),
      S('f', 'The Legendborn Cycle'),
      S('g', 'The Legends of Thezmarr'),
      S('h', 'Fifty Shades'),
      S('i', 'Fifty Shades as Told by Christian'),
      S('j', 'Ravenhood Legacy'),
      S('k', 'The Ravenhood'),
    ]
    expect(proposeConsolidation(rows, [])).toEqual([])
  })

  it('a distinct ruling suppresses the pair, whichever key order the ruling stored', () => {
    const rows = [S('a', 'ACOTAR', 1, 1), S('b', 'A Court of Thorns and Roses', 7, 3)]
    const [kA, kB] = canonicalPairKeys('acotar', 'courtofthornsandroses')
    expect(proposeConsolidation(rows, [D(kA, kB)])).toEqual([])
    // Reversed keys in the ruling row still suppress — canonicalization is the guard, not luck.
    expect(proposeConsolidation(rows, [D(kB, kA)])).toEqual([])
  })

  it('related_but_separate and same suppress exactly like distinct — any ruling ends proposal', () => {
    const rows = [S('a', 'ACOTAR', 1, 1), S('b', 'A Court of Thorns and Roses', 7, 3)]
    const [kA, kB] = canonicalPairKeys('acotar', 'courtofthornsandroses')
    expect(proposeConsolidation(rows, [D(kA, kB, 'related_but_separate')])).toEqual([])
    expect(proposeConsolidation(rows, [D(kA, kB, 'same')])).toEqual([])
  })

  it('a ruling on an exact-variant pair suppresses even Tier 2 — no ruling is ever overridden', () => {
    const rows = [S('a', 'The Freckled Fate', 4, 4), S('b', 'The Freckled Fate Series', 0, 1)]
    const key = 'freckledfate'
    expect(proposeConsolidation(rows, [D(key, key)])).toEqual([])
  })

  it('three rows with one key merge loser-by-loser against a single primary', () => {
    const rows = [S('a', 'X', 5, 5), S('b', 'The X', 1, 1), S('c', 'X Series', 0, 0)]
    const out = proposeConsolidation(rows, [])
    expect(out).toHaveLength(2)
    expect(out.every((c) => c.tier === 2 && c.primary.id === 'a')).toBe(true)
    expect(out.map((c) => c.loser.id).sort()).toEqual(['b', 'c'])
  })

  it('an empty name key never groups — unnamed rows cannot mass-merge', () => {
    expect(proposeConsolidation([S('a', '—'), S('b', '!!')], [])).toEqual([])
  })
})
