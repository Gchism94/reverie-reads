import { csvFile } from './csv'
import { bookGenres, normalizeImportGenres } from './genreNormalize'
import type { Book, ReadStatus, SeriesStatus } from './types'

/**
 * Export the library in the SOURCE FILE'S OWN SCHEMA — the shape of chism-books-library.csv, so a
 * reader can stack their library against that file in a spreadsheet and see, row by row, which
 * "new" books they already own under a different title or author spelling. That reconciliation is
 * the entire reason this exists; it is NOT a backup (buildBackup is), and it is deliberately lossy.
 *
 * The inverse of the CHISM_PROFILE import path in importMap.ts. Every mapping below is the
 * counterpart of one there, and the round-trip is asserted in libraryCsv.test.ts by feeding this
 * writer's output back through the app's own importer rather than by comparing strings.
 */

/**
 * Thirteen columns, three of them unnamed. Columns 8, 12 and 13 are spacers in the source file and
 * are emitted EMPTY.
 *
 * DO NOT "clean these up". The whole purpose of this export is that its rows stack against the
 * existing file's rows in a spreadsheet, and a 13-vs-11 column mismatch breaks exactly that. The
 * spacers are load-bearing precisely because they carry nothing.
 */
const LIBRARY_CSV_HEADER: readonly string[] = [
  'Title',
  'Author, First',
  'Author, Last',
  'Series',
  'Completed / Standalones',
  'Genre',
  'Tags',
  '', // spacer
  'GC Read',
  'TC Read',
  'Duplicate',
  '', // spacer
  '', // spacer
]

/**
 * One canonical spelling per series status.
 *
 * The source file is INCONSISTENT here — it carries 'Complete' (70), 'Completed' (60),
 * 'Completed; Standalones' (20), 'Standalones' (16) and empty (942) for what are only a few
 * distinct states. There is no byte-faithful spelling to emit, so this column round-trips
 * SEMANTICALLY, not byte-for-byte: every spelling below is one `normalizeSeriesStatus` maps back to
 * the same status it came from, which the test asserts for all seven.
 *
 * Typed as a total Record so a status added to the union fails `tsc` here until it has a spelling,
 * rather than silently exporting as something else.
 */
const STATUS_SPELLING: Record<SeriesStatus, string> = {
  standalone: 'Standalones',
  ongoing: 'Ongoing',
  completed: 'Completed',
  on_hiatus: 'On hiatus',
  cancelled: 'Cancelled',
  interconnected_standalone: 'Interconnected standalones',
  interconnected_series: 'Interconnected series',
}

/**
 * Read state → the source's own vocabulary: 'X' read, 'IP' reading, empty otherwise. Measured off
 * the real file (X=158, IP=17, empty=991) — NOT invented as 'Y'/'N'/'TRUE'. Unread, DNF and unset
 * all emit empty because the source has no spelling for any of them; DNF is therefore not
 * recoverable from this file, which is a property of the schema, not an oversight.
 */
const GC_READ_SPELLING: Record<ReadStatus, string> = {
  Read: 'X',
  Reading: 'IP',
  Unread: '',
  DNF: '',
  unset: '',
}

/** Semicolon-joined, matching the source's 'Fantasy; Romance' shape. */
const joinMulti = (values: readonly string[]): string => values.filter(Boolean).join('; ')

/**
 * Canonical display casing for a stored genre. The source's casing is mixed ('romance' and
 * 'Romance' both occur) and stored genres vary the same way, so each one is passed back through the
 * app's OWN genre normalizer rather than through a casing table written here — a second table would
 * drift from the first the moment an alias is added. A genre the normalizer does not recognize (a
 * reader's own vocabulary) passes through verbatim instead of being dropped.
 */
const displayGenre = (g: string): string => normalizeImportGenres(g).genres[0] ?? g

/** The fields this export reads. Narrow on purpose: it is a projection, not a serialization. */
export type LibraryCsvBook = Pick<
  Book,
  'title' | 'first' | 'last' | 'series' | 'status' | 'genre' | 'genres' | 'tags' | 'readStatus'
>

export function libraryCsvRow(b: LibraryCsvBook): string[] {
  return [
    b.title,
    b.first,
    b.last,
    // Name only. The source carries no series position and neither does this — a position here
    // would be a column the file being stacked against has nowhere to put.
    b.series,
    STATUS_SPELLING[b.status] ?? '',
    joinMulti(bookGenres(b).map(displayGenre)),
    joinMulti(b.tags),
    '', // spacer
    GC_READ_SPELLING[b.readStatus] ?? '',
    // TC Read is a SECOND PERSON'S reading data. The import goes out of its way never to write it
    // and only counts what it is leaving behind; an export must not fabricate it either. The column
    // is emitted so the shape matches; a value never is.
    '',
    // Duplicate is a manual annotation in the source. The app has no equivalent and must not guess
    // one — a guessed duplicate flag would be read as the reader's own judgement.
    '',
    '', // spacer
    '', // spacer
  ]
}

/** Sorted by title so two exports of the same library are byte-identical and the file can be
 *  stacked against a sorted copy of the source. */
export function libraryCsv(books: readonly LibraryCsvBook[]): string {
  const rows = [...books]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((b) => libraryCsvRow(b))
  return csvFile(LIBRARY_CSV_HEADER, rows)
}
