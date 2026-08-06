import type { Book, ReadStatus, SeriesStatus } from './types'
import { bookSubgenres } from './genreNormalize'
import { bookTropeNames } from './tropes'
import { authorOf } from './normalize'
import { normalizeName } from './contributors'
import { isOwnedBook, isPossessed, isWanted } from './ownership'
import { claimedSeriesLength } from './seriesIndex'

export type LibrarySort = 'az' | 'author' | 'rating' | 'intensity' | 'recent' | 'series'
export type SeriesLenBucket = 'Any' | '1' | '2' | '3' | '4' | '5+' | 'Unknown'
export type LibraryMode = 'grid' | 'series'
/** Mirrors the /shelves derived-shelf sections (ShelfSectionKey in shelves.ts), for the Library link
 *  each section header carries. Kept as its own facet rather than overloading `read`/`wishlist`
 *  because it must replicate the shelf's own predicate exactly (e.g. the Read shelf's unsplit count
 *  includes DNF — `hasReadingHistory`, not `isBookRead`) and it must bypass the default-library scope
 *  gate the way `deriveShelfSections` does, since it filters the whole library, not just what's
 *  already in view. */
export type LibraryShelfLink = 'All' | 'owned' | 'borrowed' | 'read' | 'wishlist'

export interface LibraryFilters {
  q: string
  sub: 'All' | string
  tags: string[]
  status: 'All' | SeriesStatus
  len: SeriesLenBucket
  read: 'All' | ReadStatus
  format: 'All' | string
  fave: boolean
  /** selected intensity/spice levels (1–5); empty = any. A book matches if its level is in the set. */
  intensity: number[]
  /** filter to books where any contributor matches this name ('' = off) */
  author: string
  /** include books outside the default scope — books you neither have in hand nor ever opened.
   *  Off by default: the grid is what you have or have engaged with (see inDefaultLibrary). */
  wishlist: boolean
  /** which /shelves derived-shelf section this view was opened from ('All' = none) */
  shelf: LibraryShelfLink
  sort: LibrarySort
}

export const defaultFilters = (): LibraryFilters => ({
  q: '',
  sub: 'All',
  tags: [],
  status: 'All',
  len: 'Any',
  read: 'All',
  format: 'All',
  fave: false,
  intensity: [],
  author: '',
  wishlist: false,
  shelf: 'All',
  sort: 'az',
})

/** Does any of the book's contributors match the given name (case/space-insensitive)? */
export function bookHasAuthor(b: Book, name: string): boolean {
  const key = normalizeName(name)
  if (!key) return true
  if (b.contributors.length) return b.contributors.some((c) => normalizeName(c.name) === key)
  return normalizeName(authorOf(b)) === key // back-compat for not-yet-joined books
}

/** A book counts as "read" if marked Read or it has any logged reads.
 *
 *  DNF is deliberately NOT read, and this predicate must stay that way: it feeds series progress,
 *  the taste profile, the reading stats and the matcher, where counting an abandoned book as read
 *  would overstate a series' completion and teach the recommender from a book the reader bailed on.
 *  Library VISIBILITY is a different question — see hasReadingHistory. */
export const isBookRead = (b: Book): boolean => b.readStatus === 'Read' || b.reads.length > 0

/** Has the reader engaged with this book at all — finished it, or started and abandoned it.
 *
 *  Split from isBookRead because the two questions diverge on exactly one status. A DNF book you
 *  never owned was invisible: not possessed, not read, so outside the default library and reachable
 *  only through the wishlist chip. That is a book the reader definitely handled, hidden by a
 *  predicate meant to hide books they had not. Visibility says yes; "read" still says no. */
export const hasReadingHistory = (b: Book): boolean => isBookRead(b) || b.readStatus === 'DNF'

/** The default library scope (docs/task-shelf-model.md): anything you have in hand (owned or
 *  borrowed) OR have any reading history with, DNF included. Reading history is never hidden by
 *  possession — a book you read from the library stays in your library. Books you neither had nor
 *  opened fall outside; the wishlist chip lets them back in. */
export const inDefaultLibrary = (b: Book): boolean => isPossessed(b) || hasReadingHistory(b)

const positionOf = (b: Book, fallback = 0): number =>
  typeof b.position === 'number' ? b.position : Number(b.position) || fallback

/** Which "Books in series" bucket a book falls in (null length => "Unknown"/"None set"). */
export function seriesLenBucket(b: Book): SeriesLenBucket {
  const c = b.seriesCount
  if (c == null) return 'Unknown'
  if (c >= 5) return '5+'
  return String(c) as SeriesLenBucket
}

/** The prototype's library predicate, ported verbatim. */
export function matchesFilters(b: Book, f: LibraryFilters): boolean {
  // A shelf link replaces collection scoping rather than adding to it — it must show exactly the
  // set /shelves showed (deriveShelfSections filters the WHOLE library, not the default-scoped
  // view), so a wishlist-only book reached via the Wishlist shelf must not be excluded by the
  // default-library gate below.
  if (f.shelf !== 'All') {
    if (f.shelf === 'owned' && !isOwnedBook(b)) return false
    if (f.shelf === 'borrowed' && !b.borrowed) return false
    if (f.shelf === 'read' && !hasReadingHistory(b)) return false
    if (f.shelf === 'wishlist' && !isWanted(b)) return false
  } else if (!f.wishlist && !inDefaultLibrary(b)) return false
  if (f.sub !== 'All' && !bookSubgenres(b).includes(f.sub)) return false
  if (f.tags.length) {
    const names = bookTropeNames(b)
    if (!f.tags.every((t) => names.includes(t))) return false
  }
  if (f.status !== 'All' && b.status !== f.status) return false
  if (f.len !== 'Any' && seriesLenBucket(b) !== f.len) return false
  if (f.read !== 'All') {
    const read = isBookRead(b)
    if (f.read === 'Read' && !read) return false
    if (f.read === 'Unread' && (read || b.readStatus === 'Reading' || b.readStatus === 'DNF'))
      return false
    if (f.read === 'Reading' && b.readStatus !== 'Reading') return false
    if (f.read === 'DNF' && b.readStatus !== 'DNF') return false
    if (f.read === 'unset' && b.readStatus !== 'unset') return false
  }
  if (f.format !== 'All' && b.format !== f.format) return false
  if (f.fave && !b.fave) return false
  if (f.intensity.length && !f.intensity.includes(b.intensity ?? 0)) return false
  if (f.author && !bookHasAuthor(b, f.author)) return false
  if (f.q) {
    const hay = [
      b.title,
      authorOf(b),
      b.series,
      ...b.tags,
      ...b.tropes.map((t) => t.name),
      ...b.genres,
    ]
      .join(' ')
      .toLowerCase()
    if (!hay.includes(f.q.toLowerCase())) return false
  }
  return true
}

/** Ported verbatim from the prototype's libSort. */
export function sortBooks(books: readonly Book[], sort: LibrarySort): Book[] {
  const c = [...books]
  switch (sort) {
    case 'az':
      c.sort((a, b) => a.title.localeCompare(b.title))
      break
    case 'author':
      c.sort(
        (a, b) =>
          (a.last || a.title).localeCompare(b.last || b.title) || positionOf(a) - positionOf(b),
      )
      break
    case 'rating':
      c.sort((a, b) => b.rating - a.rating)
      break
    case 'intensity':
      c.sort((a, b) => (b.intensity ?? -1) - (a.intensity ?? -1))
      break
    case 'recent':
      c.sort((a, b) => (b.addedTs || 0) - (a.addedTs || 0))
      break
    case 'series':
      c.sort(
        (a, b) =>
          (a.series || 'zzz').localeCompare(b.series || 'zzz') || positionOf(a) - positionOf(b),
      )
      break
  }
  return c
}

/** How many filters are active (drives the "(n)" badge); search box not counted. */
export function activeFilterCount(f: LibraryFilters): number {
  let n = 0
  if (f.sub !== 'All') n++
  n += f.tags.length
  if (f.status !== 'All') n++
  if (f.len !== 'Any') n++
  if (f.read !== 'All') n++
  if (f.format !== 'All') n++
  if (f.fave) n++
  if (f.intensity.length) n++
  if (f.author) n++
  if (f.wishlist) n++
  if (f.shelf !== 'All') n++
  return n
}

export interface SeriesGroup {
  name: string
  books: Book[] // sorted by position
  total: number | null // series length, if known
  owned: number
  read: number
}

/** Group books by series for the Series view, with owned-of-total and read counts. */
export function groupSeries(books: readonly Book[]): SeriesGroup[] {
  const groups = new Map<string, Book[]>()
  for (const b of books) {
    if (!b.series) continue
    const g = groups.get(b.series) ?? []
    g.push(b)
    groups.set(b.series, g)
  }
  return [...groups.entries()]
    .map(([name, bs]) => {
      const sorted = [...bs].sort((a, b) => positionOf(a, 99) - positionOf(b, 99))
      // Same order-dependent read as SeriesIndexRoute carried, and the doc named only that one:
      // both surfaces have to change together or the Library Series view and the Series index
      // disagree about the same series. See claimedSeriesLength for why MAX.
      const total = claimedSeriesLength(sorted)
      return {
        name,
        books: sorted,
        total,
        owned: sorted.length,
        read: sorted.filter(isBookRead).length,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
