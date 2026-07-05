import { describe, expect, it } from 'vitest'
import { bookVerdict, buildTasteProfile, tasteFit } from './tasteProfile'
import { makeBook } from './book.fixture'

const NOW = Date.parse('2026-07-01')

describe('bookVerdict', () => {
  it('maps the reader signals onto -1..1', () => {
    expect(bookVerdict(makeBook({ id: '1', title: 'a', readStatus: 'Read', rating: 5 }))).toBe(1)
    expect(bookVerdict(makeBook({ id: '2', title: 'b', readStatus: 'Read', rating: 1 }))).toBe(-1)
    expect(bookVerdict(makeBook({ id: '3', title: 'c', readStatus: 'DNF' }))).toBe(-1)
    expect(bookVerdict(makeBook({ id: '4', title: 'd', readStatus: 'Unread' }))).toBeNull()
    // an unrated finish is a mild positive; a fave lifts it
    expect(bookVerdict(makeBook({ id: '5', title: 'e', readStatus: 'Read' }))).toBeCloseTo(0.2)
    expect(bookVerdict(makeBook({ id: '6', title: 'f', readStatus: 'Read', fave: true }))).toBeCloseTo(0.6)
  })
})

describe('buildTasteProfile + tasteFit', () => {
  const library = [
    makeBook({ id: '1', title: 'L1', tags: ['Locked Room', 'Noir'], subgenre: 'Noir', readStatus: 'Read', rating: 5 }),
    makeBook({ id: '2', title: 'L2', tags: ['Locked Room'], subgenre: 'Noir', readStatus: 'Read', rating: 5 }),
    makeBook({ id: '3', title: 'H1', tags: ['Billionaire'], subgenre: 'Romance', readStatus: 'Read', rating: 1 }),
    makeBook({ id: '4', title: 'H2', tags: ['Billionaire'], subgenre: 'Romance', readStatus: 'DNF' }),
    makeBook({ id: '5', title: 'U', tags: ['Fae'], subgenre: 'Romantasy', readStatus: 'Unread' }),
  ]
  const taste = buildTasteProfile(library, { now: NOW })

  it('learns loved and hated tags/worlds from verdicts (unread books contribute nothing)', () => {
    expect(taste.tagAffinity['locked room']).toBeGreaterThan(0.5)
    expect(taste.tagAffinity['billionaire']).toBeLessThan(-0.5)
    expect(taste.tagAffinity['fae']).toBeUndefined()
    expect(taste.subAffinity['Noir']).toBeGreaterThan(0)
    expect(taste.subAffinity['Romance']).toBeLessThan(0)
    expect(taste.signalCount).toBe(4)
  })

  it('records the reader baseline and uses it as the no-evidence prior', () => {
    const blank = tasteFit(makeBook({ id: 'x', title: 'X', tags: [], subgenre: '' }), taste)
    expect(blank.tagFit).toBeCloseTo((taste.baseline + 1) / 2, 5)
    expect(blank.worldFit).toBeCloseTo((taste.baseline + 1) / 2, 5)
  })

  it('fits loved-tag books above the prior and hated-tag books below it', () => {
    const prior = (taste.baseline + 1) / 2
    const loved = tasteFit(makeBook({ id: 'x', title: 'X', tags: ['Locked Room'] }), taste)
    const hated = tasteFit(makeBook({ id: 'y', title: 'Y', tags: ['Billionaire'] }), taste)
    expect(loved.tagFit).toBeGreaterThan(prior)
    expect(hated.tagFit).toBeLessThan(prior)
    expect(loved.lovedTags).toEqual(['Locked Room'])
  })

  it('evidence-weighting keeps a strong love from being diluted by a lukewarm co-tag', () => {
    // 'mid' is a weak mixed signal; the strong 'Locked Room' should dominate the blend
    const lib = [
      ...library,
      makeBook({ id: '6', title: 'M1', tags: ['Mid'], readStatus: 'Read', rating: 3 }),
      makeBook({ id: '7', title: 'M2', tags: ['Mid'], readStatus: 'Read', rating: 3 }),
    ]
    const t = buildTasteProfile(lib, { now: NOW })
    const both = tasteFit(makeBook({ id: 'x', title: 'X', tags: ['Locked Room', 'Mid'] }), t)
    const onlyLoved = tasteFit(makeBook({ id: 'y', title: 'Y', tags: ['Locked Room'] }), t)
    expect(both.tagFit).toBeGreaterThan((t.baseline + 1) / 2)
    // dilution is bounded: adding one neutral co-tag costs little
    expect(onlyLoved.tagFit - both.tagFit).toBeLessThan(0.12)
  })

  it('cold start (no signal) returns pure neutral', () => {
    const empty = buildTasteProfile([makeBook({ id: '1', title: 'a', readStatus: 'Unread' })], { now: NOW })
    expect(empty.signalCount).toBe(0)
    const fit = tasteFit(makeBook({ id: 'x', title: 'X', tags: ['Anything'] }), empty)
    expect(fit.tagFit).toBe(0.5)
    expect(fit.worldFit).toBe(0.5)
  })
})
