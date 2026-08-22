import { describe, expect, it } from 'vitest'
import { libraryCsv, libraryCsvRow } from './libraryCsv'
import type { LibraryCsvBook } from './libraryCsv'
import { parseCSV } from './csv'
import { CHISM_PROFILE, detectProfile, parseImport } from './importMap'
import { normalizeSeriesStatus } from './seriesStatus'
import type { ReadStatus, SeriesStatus } from './types'
import { toRecords } from '../../../scripts/corpus-import-lib'

/**
 * The header exactly as it appears in the source file (chism-books-library.csv) — the same literal
 * the corpus importer's own fixture carries in corpusImport.test.ts. Written out here rather than
 * built from LIBRARY_CSV_HEADER, so that a change to the array is a change AGAINST this string
 * rather than something this test follows along with.
 */
const SOURCE_HEADER =
  'Title,"Author, First","Author, Last",Series,Completed / Standalones,Genre,Tags,,GC Read,TC Read,Duplicate,,'

const book = (partial: Partial<LibraryCsvBook> = {}): LibraryCsvBook => ({
  title: 'A Book',
  first: 'Ada',
  last: 'Reyes',
  series: '',
  status: 'standalone',
  genre: '',
  genres: [],
  tags: [],
  readStatus: 'Unread',
  ...partial,
})

const lines = (csv: string) => csv.trimEnd().split('\n')

describe('the header is the source file’s, byte for byte', () => {
  it('emits exactly the 13-column header the source carries', () => {
    expect(lines(libraryCsv([]))[0]).toBe(SOURCE_HEADER)
  })

  it('keeps all three unnamed spacer columns — 8, 12 and 13 — on the header AND every row', () => {
    // The spacers are the reason this export can be stacked against the source file at all: an
    // 11-column export would misalign every column after Tags. Assert the count on a row too, not
    // just the header, since only the rows are built per book.
    const grid = parseCSV(libraryCsv([book(), book({ title: 'Another' })]))
    expect(grid[0]).toHaveLength(13)
    expect(grid[0]?.[7]).toBe('')
    expect(grid[0]?.[11]).toBe('')
    expect(grid[0]?.[12]).toBe('')
    for (const row of grid.slice(1)) expect(row).toHaveLength(13)
  })

  it('the header is recognized by the importer that reads the source file', () => {
    // toRecords locates every column BY HEADER NAME and throws `missing expected column "X"` if one
    // is renamed or absent. This is the assertion that the export is genuinely in the source's
    // schema, rather than merely resembling it.
    expect(() => toRecords(parseCSV(libraryCsv([book()])))).not.toThrow()
  })

  it('the header routes the in-app CSV import to the Chism profile, not the generic one', () => {
    expect(detectProfile(parseCSV(libraryCsv([]))[0] ?? [])).toBe(CHISM_PROFILE)
  })
})

describe('every column maps as specified', () => {
  const b = book({
    title: 'The Bone Season',
    first: 'Samantha',
    last: 'Shannon',
    series: 'The Bone Season',
    status: 'ongoing',
    genre: '',
    genres: ['Fantasy', 'Romance'],
    tags: ['enemies to lovers', 'slow burn'],
    readStatus: 'Read',
  })

  it('places each value in its own column', () => {
    expect(libraryCsvRow(b)).toEqual([
      'The Bone Season',
      'Samantha',
      'Shannon',
      'The Bone Season',
      'Ongoing',
      'Fantasy; Romance',
      'enemies to lovers; slow burn',
      '',
      'X',
      '',
      '',
      '',
      '',
    ])
  })

  it('joins genres and tags with the source’s "; " convention', () => {
    expect(libraryCsvRow(b)[5]).toBe('Fantasy; Romance')
    expect(libraryCsvRow(b)[6]).toBe('enemies to lovers; slow burn')
  })

  it('emits the series NAME only — the source carries no position, so neither does this', () => {
    expect(libraryCsvRow(book({ series: 'Crescent City' }))[3]).toBe('Crescent City')
  })

  it('canonicalizes genre casing, and passes a reader’s own vocabulary through rather than dropping it', () => {
    // Source casing is mixed ('romance' and 'Romance' both occur); the app's stored genres vary the
    // same way. A genre the normalizer doesn't know must survive — dropping it would silently empty
    // the column for anyone using their own labels.
    expect(libraryCsvRow(book({ genres: ['romance', 'fantasy'] }))[5]).toBe('Romance; Fantasy')
    expect(libraryCsvRow(book({ genres: ['romance', 'gaslamp'] }))[5]).toBe('Romance; gaslamp')
  })

  it('reads the pre-migration single `genre` field when `genres` is empty', () => {
    // bookGenres' fallback: older rows carry the single field. Reading genres[] alone would export
    // an empty Genre column for every one of them.
    expect(libraryCsvRow(book({ genre: 'horror', genres: [] }))[5]).toBe('Horror')
  })
})

describe('the status column round-trips semantically', () => {
  // The source is inconsistent ('Complete', 'Completed', 'Completed; Standalones', 'Standalones',
  // empty), so there is no byte-faithful spelling to emit. What must hold instead is that whatever
  // this writes, the app's own normalizer reads back as the SAME status. STATUS_SPELLING is typed
  // as a total Record<SeriesStatus, string>, so tsc already refuses a missing status; this asserts
  // the spellings chosen are ones the normalizer actually recognizes.
  const ALL: SeriesStatus[] = [
    'standalone',
    'ongoing',
    'completed',
    'on_hiatus',
    'cancelled',
    'interconnected_standalone',
    'interconnected_series',
  ]

  for (const status of ALL) {
    it(`${status} survives the round-trip through normalizeSeriesStatus`, () => {
      const spelled = libraryCsvRow(book({ status }))[4] ?? ''
      expect(spelled).not.toBe('')
      // hasSeries only decides the FALLBACK, so a recognized spelling must be stable under both —
      // otherwise the status would depend on whether the book happens to carry a series name.
      expect(normalizeSeriesStatus(spelled, true)).toBe(status)
      expect(normalizeSeriesStatus(spelled, false)).toBe(status)
    })
  }
})

describe('GC Read uses the source’s vocabulary', () => {
  // Measured off the real file: X=158, IP=17, empty=991. Not 'Y'/'N'/'TRUE'.
  const cases: [ReadStatus, string][] = [
    ['Read', 'X'],
    ['Reading', 'IP'],
    ['Unread', ''],
    ['DNF', ''],
    ['unset', ''],
  ]
  for (const [readStatus, expected] of cases) {
    it(`${readStatus} → ${expected === '' ? '(empty)' : expected}`, () => {
      expect(libraryCsvRow(book({ readStatus }))[8]).toBe(expected)
    })
  }

  it('a read book’s X is read back as Read by the app’s own importer', () => {
    const [row] = parseImport(libraryCsv([book({ readStatus: 'Read' })])).rows
    expect(row?.incoming.readStatus).toBe('Read')
  })
})

describe('TC Read and Duplicate are empty unconditionally', () => {
  // TC Read is a second person's reading data and Duplicate is a manual annotation; the app has an
  // equivalent for neither. Both columns exist so the shape matches — a value in either would be a
  // fabrication attributed to the reader.
  it('stays empty for a book that tempts a mapping on both counts', () => {
    // Read (so GC Read is populated and the row is plainly not a blank one) and one of an identical
    // pair — the exact shape a "helpful" Duplicate flag or a copied read-state would latch onto.
    const dupe = book({ title: 'Twice Over', first: 'Ada', last: 'Reyes', readStatus: 'Read' })
    const grid = parseCSV(libraryCsv([dupe, { ...dupe }]))
    expect(grid).toHaveLength(3)
    for (const row of grid.slice(1)) {
      expect(row[8]).toBe('X') // the row IS populated — absence below is not just an empty row
      expect(row[9]).toBe('') // TC Read
      expect(row[10]).toBe('') // Duplicate
    }
  })

  it('the importer reads no duplicate flag back off the export', () => {
    const dupe = book({ title: 'Twice Over', readStatus: 'Read' })
    for (const row of parseImport(libraryCsv([dupe, { ...dupe }])).rows)
      expect(row.duplicate).toBe(false)
  })
})

describe('escaping — a title that would shift every later column', () => {
  const nasty = book({
    title: 'Salt, Harbour: "A Novel" — Ada’s Story',
    last: 'O’Reyes, Jr.',
    tags: ['found family', 'quote "in" tag'],
    readStatus: 'Read',
  })

  it('survives a round-trip through core’s own parseCSV, cell for cell', () => {
    // The real assertion, not a string comparison: what matters is that a reader of the file gets
    // back exactly what went in, with the row still 13 columns wide.
    const grid = parseCSV(libraryCsv([nasty]))
    const row = grid[1] ?? []
    expect(row).toHaveLength(13)
    expect(row[0]).toBe('Salt, Harbour: "A Novel" — Ada’s Story')
    expect(row[2]).toBe('O’Reyes, Jr.')
    expect(row[6]).toBe('found family; quote "in" tag')
    expect(row[8]).toBe('X')
  })

  it('the columns after the comma are still the right columns', () => {
    // The specific failure an unescaped cell causes is not a mangled title — it is a file that
    // reads plausibly while every later value sits one column to the left.
    const grid = parseCSV(libraryCsv([nasty, book({ title: 'Zebra', readStatus: 'Reading' })]))
    expect(grid[2]?.[8]).toBe('IP')
    expect(toRecords(grid).map((r) => r.title)).toEqual([
      'Salt, Harbour: "A Novel" — Ada’s Story',
      'Zebra',
    ])
  })

  it('a newline inside a title does not become a new row', () => {
    const grid = parseCSV(libraryCsv([book({ title: 'Broken\nLine' })]))
    expect(grid).toHaveLength(2)
    expect(grid[1]?.[0]).toBe('Broken\nLine')
  })
})

describe('whole-file shape', () => {
  it('sorts by title so two exports of the same library are identical', () => {
    const a = [book({ title: 'Zebra' }), book({ title: 'Apple' }), book({ title: 'Mango' })]
    expect(libraryCsv(a)).toBe(libraryCsv([...a].reverse()))
    expect(
      parseCSV(libraryCsv(a))
        .slice(1)
        .map((r) => r[0]),
    ).toEqual(['Apple', 'Mango', 'Zebra'])
  })

  it('an empty library is a header and nothing else', () => {
    expect(libraryCsv([])).toBe(`${SOURCE_HEADER}\n`)
  })

  it('every book in the library reaches the file', () => {
    const many = Array.from({ length: 250 }, (_, i) =>
      book({ title: `Book ${String(i).padStart(3, '0')}` }),
    )
    expect(toRecords(parseCSV(libraryCsv(many)))).toHaveLength(250)
  })
})
