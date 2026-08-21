import { describe, expect, it } from 'vitest'
import { makeBook } from './book.fixture'
import { mergeBooks } from './merge'
import { applyBookMergePicks, bookMergeOptions, BOOK_MERGE_FIELDS } from './mergeBookPicker'

// The library-merge picker: options mirror what the ENGINE does, and applying no picks IS the
// engine. The equivalence test is the load-bearing one — SettingsRoute's bulk merges pass no
// picks, so any drift between applyBookMergePicks({}) and mergeBooks breaks the bulk path.

const primary = () =>
  makeBook({
    id: 'p',
    title: 'Ember and Ash: A Novel',
    first: 'Mira',
    last: 'Holt',
    rating: 4.5,
    format: 'Paperback',
    // blank on purpose: series (add row), isbn (fill row)
  })

const loser = () =>
  makeBook({
    id: 'l',
    title: 'Ember and Ash',
    first: 'Mira',
    last: 'Holt',
    rating: 5,
    format: 'Hardcover',
    series: 'Ashfall Cycle',
    isbn: '9781234567897',
    cover: 'https://covers.example/x.jpg',
  })

describe('bookMergeOptions', () => {
  it('offers only fields with something to decide, with the engine answer as the default', () => {
    const opts = bookMergeOptions(primary(), loser())
    const byKey = Object.fromEntries(opts.map((o) => [o.key, o]))
    // both set, different -> replace, default OFF (engine keeps the primary's)
    expect(byKey.title).toMatchObject({
      kind: 'replace',
      take: false,
      mine: 'Ember and Ash: A Novel',
      theirs: 'Ember and Ash',
    })
    expect(byKey.rating).toMatchObject({ kind: 'replace', take: false, mine: '4.5★', theirs: '5★' })
    expect(byKey.format).toMatchObject({ kind: 'replace', take: false })
    // primary blank, loser set, FILL field -> add, default ON (series/genre/format/pub/rating/
    // cover/isbn all take the first non-empty value in the engine)
    expect(byKey.series).toMatchObject({ kind: 'add', take: true, theirs: 'Ashfall Cycle' })
    expect(byKey.isbn).toMatchObject({ kind: 'add', take: true })
    expect(byKey.cover).toMatchObject({ kind: 'add', take: true, theirs: '' }) // URL: unrenderable
    // equal on both sides -> no row at all
    expect(byKey.author).toBeUndefined()
    // blank on the loser -> nothing offered, no row
    expect(byKey.genre).toBeUndefined()
  })

  it('never offers the fields the RPC decides itself or merges by union/max', () => {
    const keys = new Set(BOOK_MERGE_FIELDS.map((f) => f.key))
    for (const banned of [
      'plan',
      'seriesUserChosen',
      'position',
      'seriesCount',
      'tags',
      'genres',
      'subgenre',
      'readStatus',
      'fave',
      'intensity',
      'progress',
      'owned',
      'ownership',
      'borrowed',
      'wishlist',
    ])
      expect(keys.has(banned), banned).toBe(false)
  })
})

describe('applyBookMergePicks', () => {
  it('with no picks is EXACTLY the engine — the bulk-merge regression guarantee', () => {
    const engine = mergeBooks({ books: [primary(), loser()], tbrs: [], collections: [] }, 'p', [
      'l',
    ]).books[0]
    expect(applyBookMergePicks(primary(), loser())).toEqual(engine)
  })

  it('defaults check out on the fixture: primary title/rating kept, isbn/cover/series filled', () => {
    const out = applyBookMergePicks(primary(), loser())
    expect(out.title).toBe('Ember and Ash: A Novel')
    expect(out.rating).toBe(4.5)
    expect(out.isbn).toBe('9781234567897')
    expect(out.cover).toBe('https://covers.example/x.jpg')
    expect(out.series).toBe('Ashfall Cycle') // fill field: the engine takes the loser's
  })

  it('a taken replace overrides the engine; untouched fields still follow it', () => {
    const out = applyBookMergePicks(primary(), loser(), { rating: true })
    expect(out.rating).toBe(5) // the override
    expect(out.title).toBe('Ember and Ash: A Novel') // untouched replace: engine (primary)
    expect(out.isbn).toBe('9781234567897') // untouched fill: engine (loser)
  })

  it('a declined fill leaves mine blank; a taken add fills a non-fill field the engine ignores', () => {
    const out = applyBookMergePicks(primary(), loser(), { isbn: false })
    expect(out.isbn).toBe('') // declined fill — reader said leave it blank
    // source has no engine fill rule: blank primary + set loser = 'add' row defaulting OFF
    const p2 = { ...primary(), source: '' } // the fixture defaults source to 'Owned'
    const l2 = { ...loser(), source: 'Library sale' }
    expect(applyBookMergePicks(p2, l2).source).toBe('')
    expect(applyBookMergePicks(p2, l2, { source: true }).source).toBe('Library sale')
  })

  it('author flips as one value, never half', () => {
    const p = makeBook({ id: 'p', title: 'T', first: 'Mira', last: 'Holt' })
    const l = makeBook({ id: 'l', title: 'T', first: 'M.R.', last: 'Holt-Vance' })
    const out = applyBookMergePicks(p, l, { author: true })
    expect([out.first, out.last]).toEqual(['M.R.', 'Holt-Vance'])
  })

  it('subgenre is union-class and never offered — the engine unions the arrays', () => {
    const p = makeBook({ id: 'p', title: 'T', subgenre: 'Romantasy', subgenres: ['Romantasy'] })
    const l = makeBook({
      id: 'l',
      title: 'T',
      subgenre: 'Dark Fantasy',
      subgenres: ['Dark Fantasy', 'Gothic'],
    })
    expect(bookMergeOptions(p, l).map((o) => o.key)).not.toContain('subgenre')
    // and the engine's union stands untouched by any pick
    expect(applyBookMergePicks(p, l).subgenres).toEqual(['Romantasy', 'Dark Fantasy', 'Gothic'])
  })
})
