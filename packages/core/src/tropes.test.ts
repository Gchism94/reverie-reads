import { describe, expect, it } from 'vitest'
import {
  frequentTropes,
  orderByAffinity,
  PIN_CAP,
  resolveTrope,
  SEED_TROPES,
  sortBookTropes,
  TROPE_FACETS,
  tropeKin,
  tropeMatches,
} from './tropes'

const byName = (name: string) => {
  const s = SEED_TROPES.find((t) => t.name === name)
  if (!s) throw new Error(`missing seed: ${name}`)
  return { id: name, ...s }
}
const ALL = SEED_TROPES.map((s) => ({ id: s.name, ...s }))

describe('seed taxonomy', () => {
  it('has no duplicate names or cross-trope alias collisions', () => {
    const seen = new Set<string>()
    for (const t of SEED_TROPES) {
      for (const key of [t.name, ...t.aliases].map((v) => v.toLowerCase())) {
        expect(seen.has(key), `'${key}' appears twice in the taxonomy`).toBe(false)
        seen.add(key)
      }
    }
  })

  it('every facet is one of the five; affinities are lowercased genre keys', () => {
    for (const t of SEED_TROPES) {
      expect(TROPE_FACETS).toContain(t.facet)
      for (const g of t.affinity) expect(g).toBe(g.toLowerCase())
    }
  })

  it('keeps the existing vocabulary — spot checks across the nine genre lists', () => {
    for (const name of [
      'Enemies to Lovers',
      'Fated Mates',
      'Locked Room',
      'Haunted House',
      'Space Opera',
      'Memoir',
      'Slice of Life',
      'Epistolary',
      'Magic Academy',
    ]) {
      expect(SEED_TROPES.some((t) => t.name === name)).toBe(true)
    }
  })
})

describe('resolution', () => {
  it('resolves shorthand aliases (TAG_ALIASES composes)', () => {
    expect(resolveTrope('e2l', ALL)?.name).toBe('Enemies to Lovers')
    expect(resolveTrope('MOC', ALL)?.name).toBe('Marriage of Convenience')
  })
  it('resolves trope-row aliases and exact names, case-insensitively', () => {
    expect(resolveTrope('werewolves', ALL)?.name).toBe('Shifters')
    expect(resolveTrope('dystopian', ALL)?.name).toBe('Dystopia')
    expect(resolveTrope('  enemies   to lovers ', ALL)?.name).toBe('Enemies to Lovers')
  })
  it('returns null for genuinely new coinages — never invents canon', () => {
    expect(resolveTrope('sentient teapot romance', ALL)).toBeNull()
    expect(resolveTrope('', ALL)).toBeNull()
  })
  it('type-ahead hits aliases too', () => {
    expect(tropeMatches('werewol', byName('Shifters'))).toBe(true)
    expect(tropeMatches('grumpy', byName('Grumpy/Sunshine'))).toBe(true)
    expect(tropeMatches('zzz', byName('Shifters'))).toBe(false)
  })
})

describe('affinity ordering', () => {
  it('genre leans lead, universals middle, other-genre last — never gated out', () => {
    const sample = [byName('Space Opera'), byName('Slow Burn'), byName('Fated Mates')]
    const forRomance = orderByAffinity(sample, 'romance').map((t) => t.name)
    expect(forRomance).toEqual(['Fated Mates', 'Slow Burn', 'Space Opera'])
    const forScifi = orderByAffinity(sample, 'science fiction').map((t) => t.name)
    expect(forScifi).toEqual(['Space Opera', 'Slow Burn', 'Fated Mates'])
    expect(forScifi).toHaveLength(3) // affinity is a hint, not a gate
  })
})

describe('assignment logic', () => {
  it('pinned lead, PIN_CAP is three', () => {
    expect(PIN_CAP).toBe(3)
    const sorted = sortBookTropes([
      { id: 'a', name: 'Banter', emphasis: 'present' },
      { id: 'b', name: 'Slow Burn', emphasis: 'pinned' },
      { id: 'c', name: 'Age Gap', emphasis: 'present' },
    ])
    expect(sorted.map((t) => t.name)).toEqual(['Slow Burn', 'Age Gap', 'Banter'])
  })

  it('frequent tropes rank by usage', () => {
    const use = [
      { tropeId: 'slow' },
      { tropeId: 'slow' },
      { tropeId: 'slow' },
      { tropeId: 'e2l' },
      { tropeId: 'e2l' },
      { tropeId: 'fae' },
    ]
    expect(frequentTropes(use, 2)).toEqual(['slow', 'e2l'])
  })

  it('kin is co-occurrence in YOUR books only', () => {
    const a = [
      { bookId: 'b1', tropeId: 'grumpy' },
      { bookId: 'b1', tropeId: 'slow' },
      { bookId: 'b2', tropeId: 'grumpy' },
      { bookId: 'b2', tropeId: 'slow' },
      { bookId: 'b2', tropeId: 'fae' },
      { bookId: 'b3', tropeId: 'fae' },
      { bookId: 'b3', tropeId: 'e2l' },
    ]
    const kin = tropeKin('grumpy', a)
    expect(kin[0]).toEqual({ tropeId: 'slow', count: 2 })
    expect(kin.find((k) => k.tropeId === 'e2l')).toBeUndefined() // b3 doesn't carry grumpy
  })
})
