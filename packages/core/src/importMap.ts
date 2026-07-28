// Column mapping + ingest for real library exports (Import I2). Real exports vary in column names
// and shape, so ingest is driven by a ColumnProfile (which headers map to which fields). Built-in
// profiles cover the two real shapes (Library, Chism) plus a generic Goodreads/StoryGraph fallback;
// callers can pass their own. Pure: parse → ImportedRow[] (an Incoming + import-only metadata the
// dedupe + connected-series steps use). The caller routes Incomings through match.ts / the merge
// path, so re-import is idempotent.

import type { Book, PubDate, ReadStatus } from './types'
import { parseCSV } from './csv'
import { cleanIsbn, type Incoming } from './match'
import { emptyOwned } from './ownership'
import { contributorsFromAuthors, fromFirstLast } from './contributors'
import { normalizeImportGenres } from './genreNormalize'

/** Which headers feed which field. Each entry is a list of accepted header names (case-insensitive). */
export interface ColumnProfile {
  name: string
  title: string[]
  author?: string[] // a single combined "First Last" / "Last, First" column
  authorFirst?: string[]
  authorLast?: string[]
  series?: string[]
  seriesOrder?: string[] // intrinsic position within the series (fractional ok)
  seriesNumber?: string[] // "Series #" — universe-ordering metadata (I3)
  globalOrder?: string[] // connected-universe read order (I3)
  seriesType?: string[] // e.g. "interconnected standalone" (I3)
  genre?: string[]
  tags?: string[]
  releaseDate?: string[]
  readDate?: string[] // when the reader finished it → a read entry (distinct from releaseDate)
  isbn?: string[] // ISBN-10/13 identifier column
  rating?: string[] // the reader's own 0–5 rating
  readStatus?: string[] // generic read-status column
  owned?: string[] // ownership column (yes/no; blank = owned) — Reverie template's "Owned"
  gcRead?: string[] // Chism: "X" = read, "IP" = reading
  duplicate?: string[] // Chism: "X" flags a known duplicate
}

/** The canonical Reverie import template — the column order the generator emits and the detector keys
 *  to. One source of truth: the .xlsx generator builds these headers, REVERIE_PROFILE maps them back,
 *  and detectProfile recognizes the shape. Keep in sync with apps/web/src/data/importTemplate.ts. */
export const REVERIE_TEMPLATE_COLUMNS = [
  'Title',
  'Author',
  'ISBN',
  'Status',
  'Rating',
  'Date Read',
  'Tags',
  'Owned',
] as const

export const REVERIE_PROFILE: ColumnProfile = {
  name: 'reverie',
  title: ['title'],
  author: ['author', 'authors'],
  isbn: ['isbn', 'isbn13', 'isbn-13', 'isbn10', 'isbn-10'],
  readStatus: ['status', 'read status'],
  rating: ['rating', 'my rating'],
  readDate: ['date read', 'last date read'],
  tags: ['tags', 'tag'],
  genre: ['genre', 'genres'],
  owned: ['owned', 'own', 'ownership'],
}

export const LIBRARY_PROFILE: ColumnProfile = {
  name: 'library',
  title: ['title'],
  authorFirst: ['author first', 'author, first', 'first', 'first name'],
  authorLast: ['author last', 'author, last', 'last', 'last name'],
  series: ['series'],
  seriesOrder: ['series order', 'order in series'],
  seriesNumber: ['series #', 'series number', 'series no'],
  globalOrder: ['global order', 'universe order', 'read order'],
  seriesType: ['series type', 'type'],
  genre: ['genre', 'genres'],
  tags: ['tags', 'tag'],
  releaseDate: ['release date', 'release', 'published', 'publication date'],
}

export const CHISM_PROFILE: ColumnProfile = {
  name: 'chism',
  title: ['title'],
  authorFirst: ['author, first', 'author first', 'first'],
  authorLast: ['author, last', 'author last', 'last'],
  series: ['series'],
  genre: ['genre', 'genres'],
  tags: ['tags', 'tag'],
  gcRead: ['gc read'],
  duplicate: ['duplicate'],
  // "Completed / Standalones", "TC Read", and the blank/Unnamed columns are intentionally unmapped.
}

export const GENERIC_PROFILE: ColumnProfile = {
  name: 'generic',
  title: ['title'],
  author: ['author', 'authors'],
  authorFirst: ['first name', 'author first'],
  authorLast: ['last name', 'author last'],
  series: ['series'],
  seriesOrder: ['series order', 'series number'],
  genre: ['genre', 'genres', 'shelf', 'bookshelves'],
  tags: ['tags', 'tag'],
  releaseDate: ['release date', 'date published', 'original publication year', 'year published'],
  readStatus: ['read status', 'exclusive shelf', 'status'],
  owned: ['owned', 'own', 'ownership'],
}

const BUILTIN = [REVERIE_PROFILE, LIBRARY_PROFILE, CHISM_PROFILE, GENERIC_PROFILE]

/** An imported row: the Incoming for matching/merging + import-only metadata for dedupe + I3. */
export interface ImportedRow {
  incoming: Incoming
  /** the source export flagged this as a known duplicate */
  duplicate: boolean
  /** connected-universe read order (I3), if the export provides it */
  globalOrder: number | null
  /** universe ordering metadata, e.g. "Series #" */
  seriesNumber: number | null
  /** raw series-type marker, e.g. "interconnected standalone" */
  seriesType: string | null
  /** the raw genre cell when it didn't map to a core genre (E3 import-review "odd genre" signal) */
  unmappedGenre: string | null
}

const normHeader = (h: string) => h.trim().toLowerCase()

/** Resolve a profile's fields to column indices against a header row (−1 when absent). */
export function buildColumnIndex(
  headers: string[],
  profile: ColumnProfile,
): Record<string, number> {
  const lower = headers.map(normHeader)
  const find = (cands?: string[]): number => {
    for (const c of cands ?? []) {
      const i = lower.indexOf(c)
      if (i >= 0) return i
    }
    return -1
  }
  const idx: Record<string, number> = {}
  for (const key of Object.keys(profile) as (keyof ColumnProfile)[]) {
    if (key === 'name') continue
    idx[key] = find(profile[key] as string[])
  }
  return idx
}

/** Pick the best built-in profile for a header row (Library/Chism markers, else generic). */
export function detectProfile(headers: string[]): ColumnProfile {
  const h = new Set(headers.map(normHeader))
  const has = (s: string) => h.has(s)
  // Reverie's own template: the clean Title/Author/ISBN/Status/Rating/Date Read/Tags shape. Its plain
  // "rating" + "status" headers distinguish it from a Goodreads export ("my rating"/"exclusive shelf").
  if (has('status') && has('rating') && has('date read') && (has('isbn') || has('tags')))
    return REVERIE_PROFILE
  if (has('gc read') || has('duplicate') || has('completed / standalones')) return CHISM_PROFILE
  if (has('global order') || has('series type') || has('series #')) return LIBRARY_PROFILE
  return GENERIC_PROFILE
}

const num = (s: string): number | null => {
  const v = Number(String(s).trim())
  return Number.isFinite(v) ? v : null
}

/** First YYYY-M-D / YYYY/M/D in a cell → a normalized YYYY-MM-DD read date (mirrors csv.ts). */
function parseReadDate(raw: string): string | null {
  const m = (raw ?? '').match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${(m[2] ?? '').padStart(2, '0')}-${(m[3] ?? '').padStart(2, '0')}`
}

/** Parse a release-date cell: 4-digit year, ISO/US date, or an Excel serial → PubDate. */
export function parseReleaseDate(raw: string): PubDate {
  const s = (raw ?? '').trim()
  if (!s) return { y: null, m: null, d: null }
  if (/^\d{4}$/.test(s)) return { y: Number(s), m: null, d: null }
  const iso = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/)
  if (iso)
    return { y: Number(iso[1]), m: Number(iso[2]) || null, d: iso[3] ? Number(iso[3]) : null }
  const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (us) return { y: Number(us[3]), m: Number(us[1]) || null, d: Number(us[2]) || null }
  // Excel serial day-number (days since 1899-12-30).
  const serial = Number(s)
  if (Number.isFinite(serial) && serial > 10000 && serial < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000)
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }
  }
  return { y: null, m: null, d: null }
}

/** Chism GC-Read cell → read status ("X" read, "IP" reading, else unread). */
function gcReadStatus(cell: string): ReadStatus {
  const v = cell.trim().toLowerCase()
  if (v === 'x' || v === 'read' || v === 'yes') return 'Read'
  if (v === 'ip' || v === 'in progress' || v === 'reading') return 'Reading'
  return 'Unread'
}

/** Generic read-status cell (Goodreads/StoryGraph shelves + the Reverie template's Status). */
function genericReadStatus(cell: string): ReadStatus {
  const v = cell.toLowerCase()
  // "unread" before the read branch — it contains the substring "read".
  if (/unread|to-read|to read|wishlist|tbr/.test(v)) return 'Unread'
  if (/dnf|did.not/.test(v)) return 'DNF'
  if (/currently|reading/.test(v)) return 'Reading'
  if (/read|finished/.test(v)) return 'Read'
  return 'Unread'
}

function contributorsFor(cell: (k: string) => string): {
  first: string
  last: string
  contributors: Incoming['contributors']
} {
  const first = cell('authorFirst').trim()
  const last = cell('authorLast').trim()
  if (first || last) return { first, last, contributors: fromFirstLast(first, last) }
  // a single combined column may carry co-authors ("A & B", "A; B", "Last, First")
  const combined = cell('author').trim()
  if (!combined) return { first: '', last: '', contributors: [] }
  if (/^[^,]+,\s*\S/.test(combined) && !/[&;]/.test(combined)) {
    // "Last, First"
    const [l, f] = combined.split(',').map((x) => x.trim())
    return { first: f ?? '', last: l ?? '', contributors: fromFirstLast(f ?? '', l ?? '') }
  }
  const names = combined.split(/\s*(?:&|;|,| and )\s*/i).filter(Boolean)
  const contributors = contributorsFromAuthors(names)
  const primary = contributors[0]?.name ?? combined
  const parts = primary.split(/\s+/)
  const pLast = parts.length > 1 ? parts.slice(1).join(' ') : primary
  const pFirst = parts.length > 1 ? (parts[0] ?? '') : ''
  return { first: pFirst, last: pLast, contributors }
}

/** Map one data row to an ImportedRow per the resolved column index. Returns null for a titleless row. */
export function rowToImported(row: string[], idx: Record<string, number>): ImportedRow | null {
  const cell = (k: string): string => {
    const i = idx[k]
    return i != null && i >= 0 ? (row[i] ?? '') : ''
  }
  const title = cell('title').trim()
  if (!title) return null

  const { first, last, contributors } = contributorsFor(cell)
  const { genre, genres, tags, intensity, unmappedGenre } = normalizeImportGenres(
    cell('genre'),
    cell('tags'),
  )

  const seriesName = cell('series').trim()
  const orderRaw = cell('seriesOrder').trim()
  const position = orderRaw === '' ? '' : (num(orderRaw) ?? '')

  // Reader's own metadata (Reverie template + any export that carries it): identifier, rating, read date.
  const isbn = cleanIsbn(cell('isbn'))
  const ratingRaw = num(cell('rating'))
  const rating = ratingRaw == null ? 0 : Math.max(0, Math.min(5, Math.round(ratingRaw)))
  const readDate = parseReadDate(cell('readDate'))
  const reads = readDate ? [{ date: readDate, format: 'Paperback', rating: 0, notes: '' }] : []

  let readStatus: ReadStatus = 'Unread'
  if ((idx.gcRead ?? -1) >= 0) readStatus = gcReadStatus(cell('gcRead'))
  else if ((idx.readStatus ?? -1) >= 0) readStatus = genericReadStatus(cell('readStatus'))
  // A recorded read date with no explicit status still means the book was read.
  if (readStatus === 'Unread' && reads.length) readStatus = 'Read'

  // Ownership (four-state — docs/task-ownership-v2.md): an explicit Owned column wins (yes/blank =
  // owned, borrow/loan = borrowed, no/wish = wishlist); otherwise a Goodreads-style wishlist shelf
  // (`to-read`/`tbr`) marks the row wishlist. Plain "Unread" is NOT a wishlist signal — unread
  // books you own are normal.
  let ownership: Book['ownership'] = 'owned'
  const ownedCell = cell('owned').trim().toLowerCase()
  if (ownedCell) {
    if (/borrow|loan/.test(ownedCell)) ownership = 'borrowed'
    else if (/^(n|no|false|0|unowned|wish)/.test(ownedCell)) ownership = 'wishlist'
    else ownership = 'owned'
  } else if (
    (idx.readStatus ?? -1) >= 0 &&
    /to-read|to read|wishlist|tbr/.test(cell('readStatus').toLowerCase())
  ) {
    ownership = 'wishlist'
  }

  const incoming: Incoming = {
    title,
    first,
    last,
    contributors,
    series: seriesName,
    position,
    status: seriesName ? 'ongoing' : 'standalone',
    genre: genre ?? undefined,
    genres,
    tags,
    intensity,
    readStatus,
    pub: parseReleaseDate(cell('releaseDate')),
    source: 'Imported',
    ownership,
    owned: emptyOwned(),
    ...(isbn ? { isbn } : {}),
    ...(rating ? { rating } : {}),
    ...(reads.length ? { reads } : {}),
  }

  return {
    incoming,
    duplicate: cell('duplicate').trim().toLowerCase() === 'x',
    globalOrder: num(cell('globalOrder')),
    seriesNumber: num(cell('seriesNumber')),
    seriesType: cell('seriesType').trim() || null,
    unmappedGenre,
  }
}

export interface ParsedImport {
  profile: ColumnProfile
  rows: ImportedRow[]
}

/** Parse an export's text into ImportedRows, auto-detecting the profile unless one is given. */
export function parseImport(text: string, profileOverride?: ColumnProfile): ParsedImport {
  const grid = parseCSV(text)
  if (grid.length < 2) return { profile: profileOverride ?? GENERIC_PROFILE, rows: [] }
  const headers = grid[0] ?? []
  const profile = profileOverride ?? detectProfile(headers)
  const idx = buildColumnIndex(headers, profile)
  const rows: ImportedRow[] = []
  for (let i = 1; i < grid.length; i++) {
    const r = rowToImported(grid[i] ?? [], idx)
    if (r) rows.push(r)
  }
  return { profile, rows }
}

export { BUILTIN as IMPORT_PROFILES }

// ── Connected-universe detection (Import I3) ──
// Some exports record a "global order": the human-curated sequence to read several interconnected
// series + standalones (e.g. read a duet, then an epilogue novella, then the next series). That's a
// reading ORDER (overlay), distinct from each book's own series + position. We group connected rows
// into universes and lay them out in the EXACT global order — never recomputed from series position.

export interface UniverseInput {
  /** stable reference to the book (an id post-ingest, or a key in tests) */
  ref: string
  /** grouping key — the author owns the interconnected world */
  author: string
  series: string
  /** book title — the final, deterministic tie-break when global order repeats (E2 / Flag 2) */
  title: string
  globalOrder: number | null
  seriesType: string | null
  /** "Series #" — which series within the universe; the first tie-break after global order */
  seriesNumber: number | null
  /** intrinsic position within its own series; the second tie-break (read book 1 before book 2) */
  seriesOrder: number | null
}

export interface UniverseOrderItem {
  ref: string
  /** the exact global-order position (used verbatim as the reading_order_item position) */
  position: number
  series: string
  seriesNumber: number | null
}

export interface UniverseOrder {
  /** the reading_order name, e.g. "Royal Elite — reading order" */
  name: string
  items: UniverseOrderItem[]
}

/** Build a UniverseInput from an imported row + the book reference it resolved to. */
export function universeInputFromRow(row: ImportedRow, ref: string): UniverseInput {
  const inc = row.incoming
  return {
    ref,
    author: [inc.first, inc.last].filter(Boolean).join(' ').trim().toLowerCase(),
    series: inc.series ?? '',
    title: inc.title,
    globalOrder: row.globalOrder,
    seriesType: row.seriesType,
    seriesNumber: row.seriesNumber,
    seriesOrder: typeof inc.position === 'number' ? inc.position : null,
  }
}

/** Numeric compare that sorts null/undefined last (used for the tie-break ladder). */
const byNum = (a: number | null | undefined, b: number | null | undefined): number => {
  const x = a ?? Number.MAX_SAFE_INTEGER
  const y = b ?? Number.MAX_SAFE_INTEGER
  return x === y ? 0 : x < y ? -1 : 1
}

const isConnected = (r: UniverseInput): boolean =>
  r.globalOrder != null || /interconnect/i.test(r.seriesType ?? '')

/**
 * Group connected rows into reading orders. A universe = an author's books that carry a global
 * order (the curated cross-series sequence); only rows WITH a global order can be sequenced, and a
 * universe needs at least two of them. Items are sorted by the exact global order (epilogues/
 * novellas land exactly where the human placed them); the name comes from the entry-point series
 * (the lowest global order). Each book keeps its own series + position — this is an overlay.
 *
 * Tie semantics (E2 / Flag 2): real exports give SEVERAL books the SAME global order (Rina Kent has
 * 3-way ties at positions 1–9 — a whole series shares one universe slot). Tied books are ALL kept as
 * a concurrent tier at that repeated position — never collided / last-write-wins / dropped. Within a
 * tie the order is fully deterministic: series number (which series), then series order (read book 1
 * before book 2), then title. So the same export always materializes the identical sequence.
 */
export function detectUniverses(rows: readonly UniverseInput[]): UniverseOrder[] {
  const byAuthor = new Map<string, UniverseInput[]>()
  for (const r of rows) {
    if (!r.author || !isConnected(r) || r.globalOrder == null) continue
    const g = byAuthor.get(r.author) ?? []
    g.push(r)
    byAuthor.set(r.author, g)
  }

  const orders: UniverseOrder[] = []
  for (const group of byAuthor.values()) {
    if (group.length < 2) continue // a single ordered book isn't a universe
    const sorted = [...group].sort(
      (a, b) =>
        byNum(a.globalOrder, b.globalOrder) || // exact curated slot
        byNum(a.seriesNumber, b.seriesNumber) || // ties: which series in the universe
        byNum(a.seriesOrder, b.seriesOrder) || // then intrinsic series position
        a.title.localeCompare(b.title), // then title — stable, deterministic
    )
    const entrySeries = sorted.find((r) => r.series)?.series ?? ''
    const name = `${entrySeries || 'Reading'} — reading order`
    orders.push({
      name,
      items: sorted.map((r) => ({
        ref: r.ref,
        position: r.globalOrder as number,
        series: r.series,
        seriesNumber: r.seriesNumber,
      })),
    })
  }
  return orders
}
