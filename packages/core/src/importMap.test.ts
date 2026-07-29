import { describe, expect, it } from 'vitest'
import { detectProfile, parseImport, parseReleaseDate } from './importMap'
import { decideIntake, matchBook, mergeImport } from './match'
import { makeBook } from './book.fixture'
import { possessionPatch, possessionState } from './ownership'
import type { Book } from './types'

// A real-shaped Chism export slice (the "Library" sheet columns, exact headers incl. the ignored
// ones). Covers: single author, multi-genre, GC Read X/IP, Duplicate, the "dark: spicy" tag, an
// ignored "Completed / Standalones" + "TC Read", and a titleless row that must be skipped.
const CHISM_CSV = [
  'Title,"Author, First","Author, Last",Series,Completed / Standalones,Genre,Tags,,GC Read,TC Read,Duplicate',
  'Twisted Love,Ana,Huang,Twisted,Completed,Romance,"dark: spicy",,X,,X',
  'Iron Flame,Rebecca,Yarros,The Empyrean,,Fantasy; Romance,Dark,,IP,,',
  'House of Leaves,Mark,Danielewski,,Standalone,Horror,Gothic,,,,',
  'Babel,R.F.,Kuang,,,Fantasy; Horror,Dark Academia,,X,,X',
  'Crime and Punishment,Fyodor,Dostoevsky,,,Fiction,"Classic; Russian Lit",,,,',
  ',,,,,,,,,,', // titleless → skipped
].join('\n')

// A real-shaped Library export slice with the connected-universe columns + a fractional position.
const LIBRARY_CSV = [
  'Title,Author First,Author Last,Series,Series order,Series #,Global order,Series type,Genre,Tags,Release date',
  'Deceptive Vows,Rina,Kent,Royal Elite,7,1,7,interconnected standalone,Romance,dark,2021-03-15',
  'Twisted Hate Novella,Rina,Kent,Twisted,3.5,2,,standalone,romace,,2022',
].join('\n')

describe('detectProfile', () => {
  it('recognizes the Chism, Library, and generic shapes', () => {
    expect(detectProfile(['Title', 'GC Read', 'Duplicate']).name).toBe('chism')
    expect(detectProfile(['Title', 'Global order', 'Series type']).name).toBe('library')
    expect(detectProfile(['Title', 'Author', 'Exclusive Shelf']).name).toBe('generic')
  })
})

describe('parseReleaseDate', () => {
  it('parses years, ISO, US, and Excel serials', () => {
    expect(parseReleaseDate('2021')).toEqual({ y: 2021, m: null, d: null })
    expect(parseReleaseDate('2021-03-15')).toEqual({ y: 2021, m: 3, d: 15 })
    expect(parseReleaseDate('3/15/2021')).toEqual({ y: 2021, m: 3, d: 15 })
    expect(parseReleaseDate('').y).toBeNull()
    expect(parseReleaseDate('45000').y).toBe(2023) // Excel serial
  })
})

describe('parseImport — Chism shape', () => {
  const { profile, rows } = parseImport(CHISM_CSV)
  it('uses the Chism profile and skips the titleless row', () => {
    expect(profile.name).toBe('chism')
    expect(rows).toHaveLength(5)
  })
  it('maps the author to a contributor (role author) + primary first/last', () => {
    const tl = rows[0]!.incoming
    expect(tl.first).toBe('Ana')
    expect(tl.last).toBe('Huang')
    expect(tl.contributors).toEqual([{ name: 'Ana Huang', role: 'author', position: 0 }])
  })
  it('normalizes genre/tags/intensity via I1', () => {
    const tl = rows[0]!.incoming // Romance + "dark: spicy"
    expect(tl.genre).toBe('Romance')
    expect(tl.tags).toEqual(['dark', 'spicy'])
    expect(tl.intensity).toBe(3)
    const iron = rows[1]!.incoming // "Fantasy; Romance"
    expect(iron.genres).toEqual(['Fantasy', 'Romance'])
    expect(iron.genre).toBe('Fantasy')
  })
  it('maps series + read status (X→Read, IP→Reading, blank→Unread)', () => {
    expect(rows[0]!.incoming.series).toBe('Twisted')
    expect(rows[0]!.incoming.status).toBe('ongoing')
    expect(rows[0]!.incoming.readStatus).toBe('Read') // GC Read X
    expect(rows[1]!.incoming.readStatus).toBe('Reading') // IP
    expect(rows[2]!.incoming.readStatus).toBe('Unread') // blank
    expect(rows[2]!.incoming.status).toBe('standalone') // no series
  })
  it('captures the Duplicate flag and drops ignored columns', () => {
    expect(rows[0]!.duplicate).toBe(true) // Twisted Love Duplicate=X
    expect(rows[3]!.duplicate).toBe(true) // Babel Duplicate=X
    expect(rows[1]!.duplicate).toBe(false)
    // "Completed / Standalones" + "TC Read" never leak into tags/genre.
    expect(rows[0]!.incoming.tags).not.toContain('completed')
    expect(rows[0]!.incoming.tags).not.toContain('x')
  })
})

describe('parseImport — Library shape (connected-universe columns + fractional position)', () => {
  const { profile, rows } = parseImport(LIBRARY_CSV)
  it('uses the Library profile', () => {
    expect(profile.name).toBe('library')
    expect(rows).toHaveLength(2)
  })
  it('keeps fractional series positions and the typo-normalized genre', () => {
    expect(rows[0]!.incoming.position).toBe(7)
    expect(rows[1]!.incoming.position).toBe(3.5) // fractional
    expect(rows[1]!.incoming.genre).toBe('Romance') // "romace" typo → Romance
  })
  it('captures global order / series # / series type metadata + release date', () => {
    expect(rows[0]!).toMatchObject({
      globalOrder: 7,
      seriesNumber: 1,
      seriesType: 'interconnected standalone',
    })
    expect(rows[0]!.incoming.pub).toEqual({ y: 2021, m: 3, d: 15 })
    expect(rows[1]!.incoming.pub).toEqual({ y: 2022, m: null, d: null })
  })
})

describe('parseImport — generic shape (combined author column)', () => {
  it('splits "Last, First" into the primary author', () => {
    const { rows } = parseImport('Title,Author,Series\n"Twisted Games","Huang, Ana",Twisted')
    expect(rows[0]!.incoming).toMatchObject({ first: 'Ana', last: 'Huang' })
  })
  it('splits co-authors ("A & B") into author + co_author', () => {
    const { rows } = parseImport('Title,Author\n"A Book","Ilona Andrews & Gordon Andrews"')
    const c = rows[0]!.incoming.contributors!
    expect(c.map((x) => x.role)).toEqual(['author', 'co_author'])
    expect(c[0]!.name).toBe('Ilona Andrews')
  })
})

// Determinism = idempotency at the parse layer (the merge path dedupes on re-import).
describe('parseImport is deterministic', () => {
  it('the same text yields identical Incomings', () => {
    expect(parseImport(CHISM_CSV).rows).toEqual(parseImport(CHISM_CSV).rows)
  })
})

// Mirror the app's intake (matchBook → decideIntake → add/mergeImport) in pure form to prove a
// re-import folds into existing books instead of duplicating.
function ingest(
  rows: ReturnType<typeof parseImport>['rows'],
  library: Book[],
): { added: number; merged: number } {
  let added = 0
  let merged = 0
  for (const { incoming } of rows) {
    const m = matchBook(incoming, library)
    const decision = decideIntake(m.strength, { autoMergeStrong: true, fuzzyMode: 'review' })
    if (decision === 'add') {
      library.push(makeBook({ id: `b${library.length}`, ...incoming }))
      added++
    } else if (decision === 'merge') {
      const { patch, changed } = mergeImport(m.book, incoming)
      Object.assign(m.book, patch)
      if (changed) merged++
    }
  }
  return { added, merged }
}

describe('ingest idempotency (re-import is a no-op via the merge path)', () => {
  it('first import adds every distinct row; re-import adds zero', () => {
    const rows = parseImport(CHISM_CSV).rows
    const library: Book[] = []
    const first = ingest(rows, library)
    expect(first.added).toBe(rows.length) // all 5 distinct
    expect(library).toHaveLength(rows.length)
    const second = ingest(rows, library)
    expect(second.added).toBe(0) // strong title+author matches → fold in, no duplicates
    expect(library).toHaveLength(rows.length)
  })
})

describe('possession on import', () => {
  /** The one possession word a spreadsheet cell yields, read back through the derived view. */
  const word = (r: { incoming: Partial<Book> }) =>
    possessionState({ ...possessionPatch('unset'), ...r.incoming })

  it('Reverie Owned column: yes/blank → owned, borrow → borrowed, no → wishlist', () => {
    const csv = [
      'Title,Author,ISBN,Status,Rating,Date Read,Tags,Owned',
      'Kept,Ana Huang,,Read,5,2025-01-02,,Yes',
      'Blank,Ana Huang,,Unread,,,,',
      'Loaned,Ana Huang,,Read,4,2025-02-02,,Borrowed',
      'Wanted,Ana Huang,,Unread,,,,No',
    ].join('\n')
    const { profile, rows } = parseImport(csv)
    expect(profile.name).toBe('reverie')
    // Assert the WORD each cell produces, then the flags behind two of them — a cell reading
    // "Borrowed" must set borrowed=true, not ownership='owned' (docs/task-shelf-model.md).
    expect(rows.map((r) => word(r))).toEqual(['owned', 'owned', 'borrowed', 'wishlist'])
    expect(rows[2]!.incoming).toMatchObject({ ownership: 'unowned', borrowed: true })
    expect(rows[3]!.incoming).toMatchObject({ ownership: 'unowned', wishlist: true })
  })

  it('Goodreads Exclusive Shelf: read/currently-reading → owned, to-read → wishlist', () => {
    const csv = [
      'Title,Author,Exclusive Shelf,My Rating',
      'Done,Ana Huang,read,5',
      'Now,Ana Huang,currently-reading,0',
      'Someday,Ana Huang,to-read,0',
    ].join('\n')
    const { rows } = parseImport(csv)
    expect(rows.map((r) => word(r))).toEqual(['owned', 'owned', 'wishlist'])
    expect(rows[2]!.incoming).toMatchObject({ ownership: 'unowned', wishlist: true })
    // and to-read stays Unread for reading status — the two axes stay independent
    expect(rows[2]!.incoming.readStatus).toBe('Unread')
  })

  it('a plain Unread status without a wishlist shelf stays owned (unread ≠ unowned)', () => {
    const csv = ['Title,Author,Status', 'OnShelf,Ana Huang,Unread'].join('\n')
    const { rows } = parseImport(csv)
    expect(rows[0]!.incoming.ownership).toBe('owned')
  })
})
