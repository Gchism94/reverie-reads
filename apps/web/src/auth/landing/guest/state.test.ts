import { describe, expect, it } from 'vitest'
import { nextReadCandidates } from '@reverie/core'
import { catalogIncoming } from './catalog'
import { guestImport, guestReducer, initialGuestState } from './state'

describe('guest library experience', () => {
  it('adds catalog choices to the library and makes only possessed books available next', () => {
    let state = guestReducer(initialGuestState(), {
      type: 'add',
      rows: [
        { ...catalogIncoming('frankenstein'), ownership: 'owned' },
        { ...catalogIncoming('braiding-sweetgrass'), wishlist: true },
      ],
    })
    expect(state.books).toHaveLength(4)
    expect(nextReadCandidates(state.books).map((book) => book.title)).toEqual([
      'Frankenstein',
      'The Left Hand of Darkness',
    ])
    state = guestReducer(state, { type: 'add', rows: [catalogIncoming('frankenstein')] })
    expect(state.books).toHaveLength(4)
    expect(state.books.find((book) => book.title === 'Frankenstein')?.ownership).toBe('owned')
  })
  it('keeps a note through finishing and rereading without changing copies or duplicating a completion', () => {
    let state = initialGuestState()
    state = guestReducer(state, {
      type: 'save',
      id: 'guest-jane',
      patch: { rating: 4.5, progress: 87 },
      notes: 'A room of her own, at last.',
    })
    expect(state.books[0]!.reads).toEqual([])
    state = guestReducer(state, { type: 'finish', id: 'guest-jane', date: '2026-09-05' })
    const completed = state.books[0]!
    expect(completed.reads).toEqual([
      {
        date: '2026-09-05',
        format: 'Paperback',
        rating: 4.5,
        notes: 'A room of her own, at last.',
      },
    ])
    expect(state.pendingNotes).toEqual({})
    expect(guestReducer(state, { type: 'finish', id: completed.id, date: '2026-09-05' })).toEqual(
      state,
    )
    state = guestReducer(state, { type: 'start', id: completed.id })
    expect(state.books[0]).toMatchObject({
      ownership: 'owned',
      owned: completed.owned,
      reads: completed.reads,
      progress: 0,
      readStatus: 'Reading',
    })
  })
  it('starts a borrowed book without making it owned and keeps independent wishlist and format flags', () => {
    let state = initialGuestState()
    state = guestReducer(state, {
      type: 'save',
      id: 'guest-left-hand',
      patch: { wishlist: true },
      notes: '',
    })
    state = guestReducer(state, { type: 'start', id: 'guest-left-hand' })
    expect(state.books[1]).toMatchObject({
      ownership: 'unowned',
      borrowed: true,
      wishlist: true,
      owned: { physical: false, ebook: false, audiobook: true },
      reads: [],
    })
  })
  it('imports the sample twice without duplicates and does not invent ownership or reading for title-only CSVs', () => {
    const simple = guestImport('Title,Author\nA new book,An Author\n')
    expect(simple.rows[0]).toMatchObject({
      title: 'A new book',
      ownership: 'unowned',
      readStatus: 'unset',
      borrowed: false,
      wishlist: false,
      reads: [],
    })
    const imported = guestImport(
      'Title,Author,Exclusive Shelf,Date Read,My Review\nFrankenstein,Mary Shelley,read,2026/08/20,A thought\n',
    )
    let state = guestReducer(initialGuestState(), { type: 'add', ...imported })
    state = guestReducer(state, { type: 'add', ...imported })
    expect(state.books).toHaveLength(3)
    expect(state.books.find((book) => book.title === 'Frankenstein')?.reads).toHaveLength(1)
    expect(state.books.find((book) => book.title === 'Frankenstein')?.reads[0]?.notes).toBe(
      'A thought',
    )
  })
  it('keeps same-title books with different authors separate', () => {
    const state = guestReducer(initialGuestState(), {
      type: 'add',
      rows: [{ title: 'Jane Eyre', first: 'Another', last: 'Writer' }],
    })
    expect(state.books).toHaveLength(3)
  })
  it('bounds import intake and rejects an oversized addition without applying part of it', () => {
    expect(() => guestImport('Title,Author\n')).toThrow(/no book rows/i)
    expect(() =>
      guestImport(
        'Title,Author\n' + Array.from({ length: 51 }, (_, i) => `Book ${i},Author`).join('\n'),
      ),
    ).toThrow(/up to 50/)
    const initial = initialGuestState()
    const state = guestReducer(initial, {
      type: 'add',
      rows: Array.from({ length: 59 }, (_, i) => ({
        title: `Book ${i}`,
        first: 'Author',
        last: `Number ${i}`,
      })),
    })
    expect(state.books).toEqual(initial.books)
    expect(state.notice).toContain('nothing from this addition was applied')
  })
  it('applies the dock arrangement and clears private guest state on reset or book removal', () => {
    let state = guestReducer(initialGuestState(), { type: 'configure', dock: ['history', 'next'] })
    expect(state.dock).toEqual(['library', 'history', 'next'])
    state = guestReducer(state, {
      type: 'save',
      id: 'guest-jane',
      patch: { rating: 4 },
      notes: 'Private draft',
    })
    state = guestReducer(state, { type: 'later', id: 'guest-jane' })
    const removed = guestReducer(state, { type: 'remove', id: 'guest-jane' })
    expect(removed.pendingNotes).toEqual({})
    expect(removed.saved).toEqual([])
    const reset = guestReducer(state, { type: 'reset' })
    expect(reset).toEqual({ ...initialGuestState(), notice: 'Guest library reset.' })
  })
})
