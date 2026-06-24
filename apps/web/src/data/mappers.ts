import type { Book, List, ReadEntry, SeriesStatus, ReadStatus } from '@reverie/core'
import type { BookRow, ListRow, ReadRow } from './types'

const SERIES_STATUS: readonly SeriesStatus[] = ['Standalone', 'Series', 'Complete']
const READ_STATUS: readonly ReadStatus[] = ['Unread', 'Reading', 'Read', 'DNF']

/** Relational book row -> domain Book. `reads` are loaded separately (see data/reads.ts). */
export function toBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    first: row.author_first ?? '',
    last: row.author_last ?? '',
    series: row.series ?? '',
    position: row.position ?? '',
    seriesCount: row.series_count,
    status: SERIES_STATUS.includes(row.status as SeriesStatus)
      ? (row.status as SeriesStatus)
      : 'Standalone',
    subgenre: row.subgenre ?? '',
    genres: row.genres ?? [],
    tropes: row.tropes ?? [],
    spice: row.spice ?? 0,
    cover: row.cover_url ?? '',
    isbn: row.isbn ?? '',
    fave: row.fave,
    format: row.format ?? '',
    rating: row.rating ?? 0,
    readStatus: READ_STATUS.includes(row.read_status as ReadStatus)
      ? (row.read_status as ReadStatus)
      : 'Unread',
    source: row.source ?? '',
    pub: { y: row.pub_y, m: row.pub_m, d: row.pub_d },
    reads: [],
    plan: row.plan_date,
    progress: row.progress ?? 0,
    boyfriend: row.boyfriend ?? undefined,
    addedTs: Date.parse(row.added_at) || 0,
  }
}

/** Domain Book patch -> writable book columns. Only provided fields are mapped. */
export function toBookRow(patch: Partial<Book>): Partial<BookRow> {
  const row: Partial<BookRow> = {}
  if (patch.title !== undefined) row.title = patch.title
  if (patch.first !== undefined) row.author_first = patch.first || null
  if (patch.last !== undefined) row.author_last = patch.last || null
  if (patch.series !== undefined) row.series = patch.series || null
  if (patch.position !== undefined) row.position = patch.position === '' ? null : patch.position
  if (patch.seriesCount !== undefined) row.series_count = patch.seriesCount
  if (patch.status !== undefined) row.status = patch.status
  if (patch.subgenre !== undefined) row.subgenre = patch.subgenre || null
  if (patch.genres !== undefined) row.genres = patch.genres
  if (patch.tropes !== undefined) row.tropes = patch.tropes
  if (patch.spice !== undefined) row.spice = patch.spice
  if (patch.cover !== undefined) row.cover_url = patch.cover || null
  if (patch.isbn !== undefined) row.isbn = patch.isbn || null
  if (patch.fave !== undefined) row.fave = patch.fave
  if (patch.format !== undefined) row.format = patch.format || null
  if (patch.rating !== undefined) row.rating = patch.rating
  if (patch.readStatus !== undefined) row.read_status = patch.readStatus
  if (patch.source !== undefined) row.source = patch.source || null
  if (patch.pub !== undefined) {
    row.pub_y = patch.pub.y
    row.pub_m = patch.pub.m
    row.pub_d = patch.pub.d
  }
  if (patch.plan !== undefined) row.plan_date = patch.plan
  if (patch.progress !== undefined) row.progress = patch.progress
  if (patch.boyfriend !== undefined) row.boyfriend = patch.boyfriend ?? null
  return row
}

export function toList(row: ListRow): List {
  return { id: row.id, name: row.name, priority: row.is_priority, ids: [] }
}

export function toReadEntry(row: ReadRow): ReadEntry {
  return {
    date: row.read_on ?? '',
    format: row.format ?? '',
    rating: row.rating ?? 0,
    notes: row.notes ?? '',
  }
}

/** A read-log entry plus its row id (needed to delete a specific entry). */
export interface ReadRecord extends ReadEntry {
  id: string
}

export function toReadRecord(row: ReadRow): ReadRecord {
  return { id: row.id, ...toReadEntry(row) }
}
