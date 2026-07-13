import {
  isContributorRole,
  toFirstLast,
  type Book,
  type Contributor,
  type List,
  type ReadEntry,
  type SeriesStatus,
  type ReadStatus,
} from '@reverie/core'
import type { BookRow, ListRow, ReadRow } from './types'

const SERIES_STATUS: readonly SeriesStatus[] = ['Standalone', 'Series', 'Complete']
const READ_STATUS: readonly ReadStatus[] = ['Unread', 'Reading', 'Read', 'DNF']
const COVER_CONFIDENCE = ['high', 'medium', 'low', 'none'] as const

/** Map the book_authors join into an ordered, role-typed contributor list. */
function toContributors(row: BookRow): Contributor[] {
  return (row.book_authors ?? [])
    .filter((ba) => ba.authors?.name)
    .map((ba) => ({
      id: ba.authors!.id,
      name: ba.authors!.name,
      role: isContributorRole(ba.role) ? ba.role : 'author',
      position: ba.position ?? 0,
    }))
    .sort((a, b) => a.position - b.position)
}

/** Relational book row -> domain Book. `reads` are loaded separately (see data/reads.ts). */
export function toBook(row: BookRow): Book {
  const contributors = toContributors(row)
  // Prefer the normalized primary author; fall back to the back-compat first/last columns.
  const primary = contributors.length ? toFirstLast(contributors) : { first: row.author_first ?? '', last: row.author_last ?? '' }
  return {
    id: row.id,
    title: row.title,
    first: primary.first,
    last: primary.last,
    contributors,
    series: row.series ?? '',
    position: row.position ?? '',
    seriesCount: row.series_count,
    status: SERIES_STATUS.includes(row.status as SeriesStatus)
      ? (row.status as SeriesStatus)
      : 'Standalone',
    genre: row.genre ?? 'romance',
    subgenre: row.subgenre ?? '',
    genres: row.genres ?? [],
    tags: row.tags ?? [],
    intensity: row.intensity ?? null,
    cover: row.cover_url ?? '',
    coverConfidence: COVER_CONFIDENCE.includes(row.cover_confidence as (typeof COVER_CONFIDENCE)[number])
      ? (row.cover_confidence as Book['coverConfidence'])
      : undefined,
    coverThumb: row.cover_thumb_url ?? undefined,
    coverSource: row.cover_source ?? undefined,
    coverSourceUrl: row.cover_source_url ?? undefined,
    coverUserChosen: row.cover_user_chosen || undefined,
    coverColor: row.cover_color ?? undefined,
    isbn: row.isbn ?? '',
    fave: row.fave,
    owned: {
      physical:
        row.owned_physical === 'paperback' || row.owned_physical === 'hardcover'
          ? row.owned_physical
          : row.owned_physical === 'yes'
            ? true
            : false,
      ebook: row.owned_ebook,
      audiobook: row.owned_audiobook,
    },
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
  if (patch.genre !== undefined) row.genre = patch.genre || 'romance'
  if (patch.subgenre !== undefined) row.subgenre = patch.subgenre || null
  if (patch.genres !== undefined) row.genres = patch.genres
  if (patch.tags !== undefined) row.tags = patch.tags
  if (patch.intensity !== undefined) row.intensity = patch.intensity
  if (patch.cover !== undefined) row.cover_url = patch.cover || null
  // coverConfidence: an EXPLICIT undefined (key present) clears the column — null = trusted
  // user-chosen cover, the cover-sheet paths' post-ingest state.
  if ('coverConfidence' in patch) row.cover_confidence = patch.coverConfidence || null
  if ('coverThumb' in patch) row.cover_thumb_url = patch.coverThumb || null
  if ('coverSource' in patch) row.cover_source = patch.coverSource || null
  if ('coverSourceUrl' in patch) row.cover_source_url = patch.coverSourceUrl || null
  if (patch.coverUserChosen !== undefined) row.cover_user_chosen = patch.coverUserChosen
  if ('coverColor' in patch) row.cover_color = patch.coverColor || null
  if (patch.isbn !== undefined) row.isbn = patch.isbn || null
  if (patch.fave !== undefined) row.fave = patch.fave
  if (patch.owned !== undefined) {
    row.owned_physical =
      patch.owned.physical === false ? null : patch.owned.physical === true ? 'yes' : patch.owned.physical
    row.owned_ebook = patch.owned.ebook
    row.owned_audiobook = patch.owned.audiobook
  }
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
