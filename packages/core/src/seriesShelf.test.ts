import { describe, expect, it } from 'vitest'
import { makeBook } from './book.fixture'
import {
  entryAfterBook,
  mergeSourceEntries,
  entryState,
  nextUp,
  positionBetween,
  progressLine,
  renumberEntries,
  seedSeriesPositions,
  seriesProgress,
  matchEntryForBook,
  sortEntries,
  unlinkedEntries,
  type ClaimableEntry,
  type SeriesEntry,
} from './seriesShelf'

const entry = (p: Partial<SeriesEntry> & { id: string; position: number }): SeriesEntry => ({
  label: null,
  title: p.id,
  author: '',
  bookId: null,
  source: 'manual',
  userEdited: false,
  ...p,
})

const read = makeBook({ id: 'r', title: 'Read One', readStatus: 'Read' })
const reading = makeBook({ id: 'c', title: 'Current', readStatus: 'Reading' })
const unread = makeBook({ id: 'u', title: 'Owned Unread' })
const wished = makeBook({ id: 'w', title: 'Wished', ownership: 'unowned', wishlist: true })
const borrowed = makeBook({
  id: 'bw',
  title: 'Borrowed Unread',
  ownership: 'unowned',
  borrowed: true,
})
const byId = new Map([read, reading, unread, wished].map((b) => [b.id, b]))

describe('entry ordering and state', () => {
  it('sorts by position with decimals interleaved', () => {
    const ids = sortEntries([
      entry({ id: 'a', position: 3 }),
      entry({ id: 'b', position: 0.5 }),
      entry({ id: 'c', position: 2.5 }),
      entry({ id: 'd', position: 1 }),
    ]).map((e) => e.id)
    expect(ids).toEqual(['b', 'd', 'c', 'a'])
  })

  it('names every state the page renders', () => {
    expect(entryState(undefined, false)).toBe('ghost')
    expect(entryState(read, false)).toBe('read')
    expect(entryState(reading, true)).toBe('reading') // reading outranks tbr
    expect(entryState(unread, true)).toBe('tbr')
    expect(entryState(unread, false)).toBe('unread')
    expect(entryState(wished, false)).toBe('wishlist')
    expect(entryState(borrowed, false)).toBe('unread') // borrowed = in hand, not "to get"
  })
})

describe('next up + chain target', () => {
  const entries = [
    entry({ id: 'e1', position: 1, bookId: 'r' }),
    entry({ id: 'e2', position: 2, bookId: 'u' }),
    entry({ id: 'e25', position: 2.5, title: 'Ghost Novella' }),
    entry({ id: 'e3', position: 3, bookId: 'w' }),
  ]

  it('next up is the first entry not yet read — a read book never elevates', () => {
    expect(nextUp(entries, byId)?.id).toBe('e2')
  })

  it('a ghost can be next up (acquisition framing)', () => {
    const ghostFirst = [entry({ id: 'g', position: 0.5, title: 'Prequel' }), ...entries]
    expect(nextUp(ghostFirst, byId)?.id).toBe('g')
  })

  it('chain prompt targets the first unfinished entry AFTER the finished book', () => {
    expect(entryAfterBook(entries, 'r', byId)?.id).toBe('e2')
    expect(entryAfterBook(entries, 'u', byId)?.id).toBe('e25') // the ghost novella is next
    expect(entryAfterBook(entries, 'w', byId)).toBeNull()
    expect(entryAfterBook(entries, 'missing', byId)).toBeNull()
  })

  it('progress counts read + to-get (ghosts and wishlist copies)', () => {
    const p = seriesProgress(entries, byId)
    expect(p).toEqual({ read: 1, total: 4, toGet: 2 })
    expect(progressLine(p)).toBe('Read 1 of 4 · 2 to get')
    expect(progressLine({ read: 2, total: 2, toGet: 0 })).toBe('Read 2 of 2')
  })
})

describe('decimal positioning (drag-to-reorder)', () => {
  it('drop between #2 and #3 lands exactly 2.5', () => {
    expect(positionBetween(2, 3)).toEqual({ position: 2.5, renumber: false })
  })
  it('prefers one clean decimal, then two', () => {
    expect(positionBetween(2, 2.5)).toEqual({ position: 2.3, renumber: false })
    expect(positionBetween(2.4, 2.5)).toEqual({ position: 2.45, renumber: false })
  })
  it('asks for a renumber when neighbours are too tight', () => {
    const r = positionBetween(2.44, 2.45)
    expect(r.renumber).toBe(true)
    expect(r.position).toBeGreaterThan(2.44)
    expect(r.position).toBeLessThan(2.45)
  })
  it('handles the edges: empty, before-first (prequel space), after-last', () => {
    expect(positionBetween(null, null)).toEqual({ position: 1, renumber: false })
    expect(positionBetween(null, 1)).toEqual({ position: 0, renumber: false })
    expect(positionBetween(7, null)).toEqual({ position: 8, renumber: false })
    expect(positionBetween(2.5, null)).toEqual({ position: 3, renumber: false })
  })
  it('renumber renormalizes to integers in current order', () => {
    const out = renumberEntries([
      entry({ id: 'a', position: 2.44 }),
      entry({ id: 'b', position: 0.5 }),
      entry({ id: 'c', position: 2.45 }),
    ])
    expect(out.map((e) => [e.id, e.position])).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 3],
    ])
  })
})

describe('ghost adoption — the population, and the rule it shares with revive', () => {
  const ghost = entry({ id: 'g', position: 4, title: '  The Winter Door ' })
  const bk = (title: string, first = '', last = '') => makeBook({ id: 'b', title, first, last })

  // This assertion used to live INSIDE ghostMatchesBook as an `e.bookId == null` clause. The matcher
  // no longer sees bookId, so the guard moved to `unlinkedEntries` and the call site — and the
  // coverage moved with it rather than evaporating, which is the failure mode of relocating a check.
  it('unlinkedEntries excludes entries that already belong to a book', () => {
    const linked = entry({ id: 'l', position: 5, title: 'Taken', bookId: 'book-1' })
    expect(unlinkedEntries([ghost, linked]).map((e) => e.id)).toEqual(['g'])
  })

  it('adopts on a normalized title match', () => {
    expect(matchEntryForBook(unlinkedEntries([ghost]), bk('the winter door'))).toEqual({
      kind: 'match',
      entry: ghost,
    })
  })

  it('does not adopt a book whose title matches nothing', () => {
    expect(matchEntryForBook(unlinkedEntries([ghost]), bk('Another Door'))).toEqual({ kind: 'none' })
  })

  it('cannot adopt an already-linked entry, because the filter removed it from the population', () => {
    const linked = entry({ id: 'l', position: 5, title: 'The Winter Door', bookId: 'book-1' })
    expect(matchEntryForBook(unlinkedEntries([linked]), bk('The Winter Door'))).toEqual({
      kind: 'none',
    })
    // ...and the same candidate UNFILTERED would have matched — so the filter is what stops it, and
    // this is exactly what breaks if a call site forgets to apply it.
    expect(matchEntryForBook([linked], bk('The Winter Door')).kind).toBe('match')
  })

  it('adopts a unique title match even when the authors disagree', () => {
    // Adoption exists because a catalog's author string almost never matches the reader's byline.
    // Requiring author on a unique match would break the feature's normal case, not harden it.
    const seeded = entry({ id: 'g2', position: 6, title: 'Iron Flame', author: 'R. Yarros' })
    expect(matchEntryForBook(unlinkedEntries([seeded]), bk('Iron Flame', 'Rebecca', 'Yarros'))).toEqual(
      { kind: 'match', entry: seeded },
    )
  })

  it('picks the right one of two same-title ghosts by author, in both directions', () => {
    const a = entry({ id: 'g-a', position: 4, title: 'Twin', author: 'Vera Quill' })
    const b = entry({ id: 'g-b', position: 5, title: 'Twin', author: 'Nell Marrow' })
    const pool = unlinkedEntries([a, b])
    expect(matchEntryForBook(pool, bk('Twin', 'Vera', 'Quill'))).toEqual({ kind: 'match', entry: a })
    expect(matchEntryForBook(pool, bk('Twin', 'Nell', 'Marrow'))).toEqual({ kind: 'match', entry: b })
  })

  it('ADOPTS NOTHING when two same-title ghosts cannot be told apart', () => {
    // The interaction that matters: refusing here hands the book to the revive pass, which can still
    // claim it correctly. Adopting the wrong ghost would consume the book and silence revive.
    const a = entry({ id: 'g-a', position: 4, title: 'Twin', author: '' })
    const b = entry({ id: 'g-b', position: 5, title: 'Twin', author: '' })
    expect(matchEntryForBook(unlinkedEntries([a, b]), bk('Twin', 'Vera', 'Quill')).kind).toBe(
      'ambiguous',
    )
  })

  it('adopts on a unique title even when one side has an empty author', () => {
    const noAuthor = entry({ id: 'g3', position: 7, title: 'Solo', author: '' })
    expect(matchEntryForBook(unlinkedEntries([noAuthor]), bk('Solo', 'Nell', 'Marrow'))).toEqual({
      kind: 'match',
      entry: noAuthor,
    })
    const named = entry({ id: 'g4', position: 8, title: 'Solo Two', author: 'Nell Marrow' })
    expect(matchEntryForBook(unlinkedEntries([named]), bk('Solo Two'))).toEqual({
      kind: 'match',
      entry: named,
    })
  })
})

describe('source merge — fills gaps, never overwrites', () => {
  const existing = [
    entry({ id: 'user', position: 1, title: 'Book One', userEdited: true, source: 'hardcover' }),
    entry({ id: 'manual', position: 2, title: 'Book Two', source: 'manual' }),
    entry({ id: 'hc', position: 9, title: 'Book Three', source: 'hardcover' }),
  ]
  const src = [
    { position: 5, title: 'Book One', author: 'A' }, // user-edited — must not move
    { position: 6, title: 'book two ', author: 'A' }, // manual entry — must not move
    { position: 3, title: 'Book Three', author: 'A' }, // hardcover + untouched — may follow catalog
    { position: 4, title: 'Book Four', author: 'A' }, // new canonical slot — ghost insert
    { position: 0, title: '', author: '' }, // catalog noise
  ]

  it('inserts only the unknown slot, moves only the never-edited hardcover row', () => {
    const { inserts, moves } = mergeSourceEntries(existing, src)
    expect(inserts).toEqual([{ position: 4, title: 'Book Four', author: 'A' }])
    expect(moves).toEqual([{ id: 'hc', position: 3 }])
  })

  it('deletes nothing by construction — a slot the catalog dropped simply stays', () => {
    const { inserts, moves } = mergeSourceEntries(existing, [])
    expect(inserts).toEqual([])
    expect(moves).toEqual([])
  })
})

describe('seeding positions for books joining a series', () => {
  const c = (id: string, position: number | null, title = id) => ({ id, title, position })

  it('keeps believable in-series indices exactly as the reader set them', () => {
    const got = seedSeriesPositions([c('a', 1), c('b', 2), c('c', 3)])
    expect([...got]).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
  })

  it('keeps the GAPS in a believable set — owning #1, #2, #5 means two are missing', () => {
    const got = seedSeriesPositions([c('a', 1), c('b', 2), c('e', 5)])
    expect(got.get('e')).toBe(5)
  })

  it('renumbers an import global-order set, preserving its relative order', () => {
    // the audit's reproduction: 412 / 87 / 1290 rendered as "#87, #412, #1290"
    const got = seedSeriesPositions([c('first', 412), c('second', 87), c('third', 1290)])
    expect(got.get('second')).toBe(1)
    expect(got.get('first')).toBe(2)
    expect(got.get('third')).toBe(3)
  })

  it('distrusts the whole set when any one value is absurd', () => {
    const got = seedSeriesPositions([c('a', 1), c('b', 2), c('runaway', 900)])
    expect([...got.values()]).toEqual([1, 2, 3])
  })

  it('distrusts duplicates — two books cannot share a slot', () => {
    const got = seedSeriesPositions([c('a', 1), c('b', 1), c('c', 2)])
    expect(new Set(got.values()).size).toBe(3)
  })

  it('orders null positions by title so the result is deterministic, not row-order', () => {
    const got = seedSeriesPositions([
      c('z', null, 'Zeta'),
      c('a', null, 'Alpha'),
      c('m', null, 'Mu'),
    ])
    expect([...got]).toEqual([
      ['a', 1],
      ['m', 2],
      ['z', 3],
    ])
  })

  it('sorts null positions after numbered ones and appends them', () => {
    const got = seedSeriesPositions([c('two', 2), c('none', null, 'Aaa'), c('one', 1)])
    expect(got.get('one')).toBe(1)
    expect(got.get('two')).toBe(2)
    expect(got.get('none')).toBe(3)
  })

  it('appends after the existing arrangement instead of renumbering it', () => {
    const got = seedSeriesPositions([c('late', null)], 7)
    expect(got.get('late')).toBe(8)
  })

  it('clears honoured indices before appending a null-position straggler', () => {
    const got = seedSeriesPositions([c('a', 1), c('e', 5), c('none', null, 'Zzz')])
    expect(got.get('none')).toBe(6)
  })

  it('keeps decimal novella slots — #2.5 is a real position', () => {
    const got = seedSeriesPositions([c('a', 1), c('novella', 2.5), c('b', 3)])
    expect(got.get('novella')).toBe(2.5)
  })
})

describe('revive match — title first, author only to break a tie', () => {
  const tomb = (p: Partial<ClaimableEntry> & { id: string }): ClaimableEntry => ({
    title: 'Shared Title',
    author: '',
    ...p,
  })
  // makeBook takes first/last; authorOf joins them, which is exactly what reconciliation writes
  // onto an entry's `author`, so both sides of the comparison are the same shape.
  const book = (title: string, first = '', last = '') => makeBook({ id: 'b', title, first, last })

  it('revives on a single title match, without consulting author at all', () => {
    // The entry author is deliberately WRONG here. One candidate means author is never read, which
    // is what keeps an empty or mismatched author from breaking the ordinary case.
    const only = tomb({ id: 't1', title: 'Shared Title', author: 'Someone Entirely Else' })
    const m = matchEntryForBook([only], book('shared title', 'Nell', 'Marrow'))
    expect(m).toEqual({ kind: 'match', entry: only })
  })

  it('matches title on trim + lowercase, like every other title match here', () => {
    const only = tomb({ id: 't1', title: '  SHARED   Title ' })
    // Inner whitespace is NOT collapsed by normTitle — assert the real behaviour, not the hoped one.
    expect(matchEntryForBook([only], book('  SHARED   Title '))).toEqual({
      kind: 'match',
      entry: only,
    })
  })

  it('finds nothing when no title matches', () => {
    expect(matchEntryForBook([tomb({ id: 't1' })], book('A Different Book'))).toEqual({
      kind: 'none',
    })
  })

  it('picks the right one of two same-title tombstones by author', () => {
    const yarros = tomb({ id: 't-yarros', author: 'Rebecca Yarros' })
    const maas = tomb({ id: 't-maas', author: 'Sarah J. Maas' })
    expect(
      matchEntryForBook([yarros, maas], book('Shared Title', 'Sarah J.', 'Maas')),
    ).toEqual({ kind: 'match', entry: maas })
    // ...and the other direction, so the test cannot pass by always choosing one side.
    expect(
      matchEntryForBook([yarros, maas], book('Shared Title', 'Rebecca', 'Yarros')),
    ).toEqual({ kind: 'match', entry: yarros })
  })

  it('REVIVES NOTHING when two same-title tombstones both have an empty author', () => {
    const a = tomb({ id: 't-a', author: '' })
    const b = tomb({ id: 't-b', author: '' })
    const m = matchEntryForBook([a, b], book('Shared Title', 'Nell', 'Marrow'))
    expect(m.kind).toBe('ambiguous')
    expect(m).toEqual({ kind: 'ambiguous', candidates: [a, b] })
  })

  it('REVIVES NOTHING when two same-title tombstones share the same author', () => {
    // A genuine reissue by one author: nothing on the row can tell them apart, so refuse.
    const a = tomb({ id: 't-a', author: 'Nell Marrow' })
    const b = tomb({ id: 't-b', author: 'Nell Marrow' })
    expect(matchEntryForBook([a, b], book('Shared Title', 'Nell', 'Marrow')).kind).toBe(
      'ambiguous',
    )
  })

  it('REVIVES NOTHING when neither candidate author matches the book', () => {
    const a = tomb({ id: 't-a', author: 'Rebecca Yarros' })
    const b = tomb({ id: 't-b', author: 'Sarah J. Maas' })
    expect(matchEntryForBook([a, b], book('Shared Title', 'Nell', 'Marrow')).kind).toBe(
      'ambiguous',
    )
  })

  it("REVIVES NOTHING when the BOOK's author is empty and two titles tie", () => {
    // An empty book author compares equal to nothing useful, so it cannot discriminate — refuse
    // rather than let '' accidentally select the tombstone that also happens to be ''.
    const a = tomb({ id: 't-a', author: '' })
    const b = tomb({ id: 't-b', author: 'Nell Marrow' })
    expect(matchEntryForBook([a, b], book('Shared Title')).kind).toBe('ambiguous')
  })

  it('still revives when the title is unique even though one side has an empty author', () => {
    // The case the empty-author-is-legitimate argument rests on: a manual ghost the reader added
    // without typing an author must still come back when they acquire the book.
    const ghostish = tomb({ id: 't1', title: 'Only One', author: '' })
    expect(matchEntryForBook([ghostish], book('Only One', 'Nell', 'Marrow'))).toEqual({
      kind: 'match',
      entry: ghostish,
    })
    // ...and symmetrically, an empty BOOK author against a named tombstone.
    const named = tomb({ id: 't2', title: 'Only Two', author: 'Nell Marrow' })
    expect(matchEntryForBook([named], book('Only Two'))).toEqual({
      kind: 'match',
      entry: named,
    })
  })

  it('discriminates on normalized author — case and whitespace cannot split one author', () => {
    const a = tomb({ id: 't-a', author: 'nell   marrow' })
    const b = tomb({ id: 't-b', author: 'Someone Else' })
    expect(matchEntryForBook([a, b], book('Shared Title', 'Nell', 'Marrow'))).toEqual({
      kind: 'match',
      entry: a,
    })
  })

  it('does NOT equate a surname-first or initial-only variant — refusing, which is the safe way to fail', () => {
    // The documented limit of normalizeName, pinned so nobody "fixes" it into fuzzy matching by
    // accident: neither variant matches, so the tie is unresolved and nothing revives.
    const inverted = tomb({ id: 't-a', author: 'Maas, Sarah J.' })
    const initials = tomb({ id: 't-b', author: 'S. J. Maas' })
    expect(
      matchEntryForBook([inverted, initials], book('Shared Title', 'Sarah J.', 'Maas')).kind,
    ).toBe('ambiguous')
  })

  it('ignores tombstones whose title differs when breaking a tie', () => {
    // A third, unrelated tombstone must not become a candidate just because it exists.
    const a = tomb({ id: 't-a', author: 'Nell Marrow' })
    const b = tomb({ id: 't-b', author: 'Someone Else' })
    const unrelated = tomb({ id: 't-c', title: 'Unrelated', author: 'Nell Marrow' })
    expect(
      matchEntryForBook([a, b, unrelated], book('Shared Title', 'Nell', 'Marrow')),
    ).toEqual({ kind: 'match', entry: a })
  })
})
