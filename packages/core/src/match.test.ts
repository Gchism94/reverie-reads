import { describe, expect, it } from 'vitest'
import {
  decideIntake,
  enrichmentSeriesFill,
  importKey,
  isbn10to13,
  matchBook,
  mergeImport,
  normalizeIsbn,
} from './match'
import { makeBook } from './book.fixture'

describe('ISBN normalization', () => {
  it('promotes ISBN-10 to ISBN-13 and matches either form', () => {
    expect(isbn10to13('0306406152')).toBe('9780306406157')
    expect(normalizeIsbn('0-306-40615-2')).toBe('9780306406157')
    expect(normalizeIsbn('9780306406157')).toBe('9780306406157')
    expect(normalizeIsbn('not-an-isbn')).toBe('')
  })
})

describe('matchBook', () => {
  const library = [
    makeBook({
      id: 'a',
      title: 'Fourth Wing',
      first: 'Rebecca',
      last: 'Yarros',
      isbn: '0306406152',
      series: 'The Empyrean',
      position: 1,
    }),
    makeBook({ id: 'b', title: 'Iron Flame', last: 'Yarros' }),
  ]

  it('matches by ISBN across 10/13 forms (strong)', () => {
    const m = matchBook({ title: 'Whatever', isbn: '9780306406157' }, library)
    expect(m.strength).toBe('isbn')
    expect(m.book.id).toBe('a')
  })

  it('matches by normalized title+author (strong)', () => {
    const m = matchBook({ title: 'iron  flame', last: 'YARROS' }, library)
    expect(m.strength).toBe('title-author')
    expect(m.book.id).toBe('b')
  })

  it('routes a subtitle-only difference to fuzzy (review, not auto)', () => {
    const m = matchBook({ title: 'Fourth Wing: The Empyrean Book One', last: 'Yarros' }, library)
    expect(m.strength).toBe('fuzzy')
    expect(m.book.id).toBe('a')
  })

  it('returns none when nothing shares a real key', () => {
    expect(matchBook({ title: 'Unrelated', last: 'Nobody' }, library).strength).toBe('none')
  })
})

describe('importKey', () => {
  it('keys by canonical ISBN-13 when present (10 and 13 forms collapse)', () => {
    expect(importKey({ title: 'Fourth Wing', last: 'Yarros', isbn: '0306406152' })).toBe(
      'isbn:9780306406157',
    )
    expect(importKey({ title: 'x', last: 'y', isbn: '9780306406157' })).toBe('isbn:9780306406157')
  })
  it('falls back to normalized title+author without an ISBN', () => {
    expect(importKey({ title: 'Iron  Flame', last: 'YARROS' })).toBe(
      importKey({ title: 'iron flame', last: 'yarros' }),
    )
  })
})

describe('decideIntake', () => {
  const o = (over: Partial<Parameters<typeof decideIntake>[1]> = {}) => ({
    autoMergeStrong: true,
    fuzzyMode: 'review' as const,
    ...over,
  })
  it('adds when nothing matched', () => {
    expect(decideIntake('none', o())).toBe('add')
  })
  it('strong match folds in when auto-merge is on, reviews when off', () => {
    expect(decideIntake('isbn', o({ autoMergeStrong: true }))).toBe('merge')
    expect(decideIntake('title-author', o({ autoMergeStrong: false }))).toBe('review')
  })
  it('fuzzy reviews on import but adds on single-add', () => {
    expect(decideIntake('fuzzy', o({ fuzzyMode: 'review' }))).toBe('review')
    expect(decideIntake('fuzzy', o({ fuzzyMode: 'add' }))).toBe('add')
  })
  it('a remembered verdict overrides everything (even with auto-merge off)', () => {
    expect(decideIntake('fuzzy', o({ verdict: 'always_merge' }))).toBe('merge')
    expect(decideIntake('isbn', o({ autoMergeStrong: false, verdict: 'always_merge' }))).toBe(
      'merge',
    )
    expect(decideIntake('fuzzy', o({ verdict: 'keep_separate' }))).toBe('skip')
    expect(decideIntake('title-author', o({ verdict: 'keep_separate' }))).toBe('skip')
  })
})

describe('enrichmentSeriesFill', () => {
  it('never overwrites a reader-chosen series', () => {
    expect(
      enrichmentSeriesFill({ series: 'The Empyrean', seriesUserChosen: true }, 'Different Series'),
    ).toBe('')
    // even after the reader clears it, their choice stands
    expect(enrichmentSeriesFill({ series: '', seriesUserChosen: true }, 'Fourth Wing Series')).toBe(
      '',
    )
  })

  it('is fill-only: existing series stay, blanks fill', () => {
    expect(enrichmentSeriesFill({ series: 'The Empyrean' }, 'Different Series')).toBe('')
    expect(enrichmentSeriesFill({ series: '' }, 'The Empyrean')).toBe('The Empyrean')
    expect(enrichmentSeriesFill({ series: '', seriesUserChosen: false }, '')).toBe('')
  })
})

describe('mergeImport', () => {
  const existing = makeBook({
    id: 'x',
    title: 'Fourth Wing',
    last: 'Yarros',
    rating: 5,
    readStatus: 'Read', // already read (it has a logged read below)
    tags: ['Dragon Riders'],
    owned: { physical: 'paperback', ebook: false, audiobook: false },
    series: '',
    cover: '',
    reads: [{ date: '2025-01-01', format: 'paperback', rating: 5, notes: 'my notes' }],
  })

  it('fills blanks and unions, but never clobbers user-authored fields', () => {
    const { patch, newReads, changed } = mergeImport(existing, {
      title: 'Fourth Wing',
      rating: 3, // must NOT overwrite the user's 5
      tags: ['Enemies to Lovers'], // unions, never removes
      owned: { physical: 'hardcover', ebook: true, audiobook: false }, // adds ebook, keeps paperback
      series: 'The Empyrean', // fills a blank
      cover: 'http://c/x.jpg', // fills a blank
      reads: [{ date: '2025-06-01', format: 'ebook', rating: 4, notes: '' }],
    })
    expect(changed).toBe(true)
    expect(patch.rating).toBeUndefined() // user rating untouched
    expect(new Set(patch.tags)).toEqual(new Set(['Dragon Riders', 'Enemies to Lovers']))
    expect(patch.owned).toEqual({ physical: 'paperback', ebook: true, audiobook: false })
    expect(patch.series).toBe('The Empyrean')
    expect(patch.cover).toBe('http://c/x.jpg')
    expect(newReads.map((r) => r.date)).toEqual(['2025-06-01'])
  })

  it('is idempotent — re-merging identical data is a no-op', () => {
    const res = mergeImport(existing, {
      title: 'Fourth Wing',
      tags: ['Dragon Riders'],
      owned: { physical: 'paperback', ebook: false, audiobook: false },
      reads: [{ date: '2025-01-01', format: 'paperback', rating: 5, notes: 'my notes' }],
    })
    expect(res.changed).toBe(false)
    expect(Object.keys(res.patch)).toHaveLength(0)
    expect(res.newReads).toHaveLength(0)
  })
})
