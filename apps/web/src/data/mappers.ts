import {
  isContributorRole,
  sortBookTropes,
  sortBookMoods,
  normalizeSeriesStatus,
  toFirstLast,
  type Book,
  type Contributor,
  type List,
  type ReadEntry,
  type ReadStatus,
} from '@reverie/core'
import type { BookRow, ListRow, ReadRow } from './types'

const READ_STATUS: readonly ReadStatus[] = ['unset', 'Unread', 'Reading', 'Read', 'DNF']
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
    seriesUserChosen: row.series_user_chosen || undefined,
    // Legacy spellings ('Standalone'/'Series'/'Complete') normalize until the migration lands.
    status: normalizeSeriesStatus(row.status, !!row.series),
    // '' = no primary chosen — the edit form prompts; nothing defaults to romance anymore.
    genre: row.genre ?? '',
    subgenre: row.subgenre ?? '',
    subgenres: row.subgenres?.length ? row.subgenres : row.subgenre ? [row.subgenre] : [],
    genres: row.genres ?? [],
    tags: row.tags ?? [],
    tropesSuggestedAt: row.tropes_suggested_at,
    tropes: sortBookTropes(
      (row.book_tropes ?? [])
        .filter((bt) => bt.tropes?.name)
        .map((bt) => ({ id: bt.tropes!.id, name: bt.tropes!.name, emphasis: bt.emphasis === 'pinned' ? ('pinned' as const) : ('present' as const) })),
    ),
    // reader-assigned moods (join); empty when the reader hasn't assigned any — never derived.
    moods: sortBookMoods(
      (row.book_moods ?? [])
        .filter((bm) => bm.moods?.name)
        .map((bm) => ({ id: bm.moods!.id, name: bm.moods!.name })),
    ),
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
    // Two-state ownership + independent flags (docs/archive/task-shelf-model.md). A row written before the
    // stage-A migration can still carry a four-state word; read it through the same mapping the
    // migration applies, so a stale cache or an un-migrated replica degrades to the right meaning
    // rather than to 'owned'. Anything unrecognized is NOT a possession claim — 'unowned'.
    ownership: row.ownership === 'owned' ? 'owned' : 'unowned',
    borrowed: row.borrowed ?? row.ownership === 'borrowed',
    wishlist: row.wishlist ?? row.ownership === 'wishlist',
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
    pages: row.pages,
    pub: { y: row.pub_y, m: row.pub_m, d: row.pub_d },
    reads: [],
    plan: { y: row.plan_y, m: row.plan_m, d: row.plan_d },
    progress: row.progress ?? 0,
    readingPosition: row.reading_position,
    readingNowHidden: row.reading_now_hidden ?? false,
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
  if (patch.seriesUserChosen !== undefined) row.series_user_chosen = patch.seriesUserChosen
  if (patch.status !== undefined) row.status = patch.status
  if (patch.genre !== undefined) row.genre = patch.genre // '' = no primary chosen (column is NOT NULL)
  // subgenres[] and the denormalized-first `subgenre` stay in sync whichever one a writer sends.
  if (patch.subgenres !== undefined) {
    row.subgenres = patch.subgenres
    row.subgenre = patch.subgenres[0] ?? null
  } else if (patch.subgenre !== undefined) {
    row.subgenre = patch.subgenre || null
    row.subgenres = patch.subgenre ? [patch.subgenre] : []
  }
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
  if (patch.ownership !== undefined) row.ownership = patch.ownership
  if (patch.borrowed !== undefined) row.borrowed = patch.borrowed
  if (patch.wishlist !== undefined) row.wishlist = patch.wishlist
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
  if (patch.pages !== undefined) row.pages = patch.pages
  if (patch.pub !== undefined) {
    row.pub_y = patch.pub.y
    row.pub_m = patch.pub.m
    row.pub_d = patch.pub.d
  }
  if (patch.plan !== undefined) {
    row.plan_y = patch.plan.y
    row.plan_m = patch.plan.m
    row.plan_d = patch.plan.d
    // plan_date is not written and no longer exists — dropped in 20260805010000.
  }
  if (patch.progress !== undefined) row.progress = patch.progress
  if (patch.readingPosition !== undefined) row.reading_position = patch.readingPosition
  if (patch.readingNowHidden !== undefined) row.reading_now_hidden = patch.readingNowHidden
  // Insert-time only in practice (imports carry Goodreads' Date Added); UI patches never set it.
  if (patch.addedTs !== undefined && patch.addedTs > 0) row.added_at = new Date(patch.addedTs).toISOString()
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
    // the per-format rating's rule-3 tiebreak (latestRatingByFormat) — same read_on, later logged
    createdAt: row.created_at,
  }
}

/** A read-log entry plus its row id (needed to delete a specific entry). */
export interface ReadRecord extends ReadEntry {
  id: string
}

export function toReadRecord(row: ReadRow): ReadRecord {
  return { id: row.id, ...toReadEntry(row) }
}
