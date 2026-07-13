import type { Book, ReadStatus, SeriesStatus } from './types'
import { bookSubgenres } from './genreNormalize'
import { authorOf } from './normalize'
import { normalizeName } from './contributors'

export type LibrarySort = 'az' | 'author' | 'rating' | 'intensity' | 'recent' | 'series'
export type SeriesLenBucket = 'Any' | '1' | '2' | '3' | '4' | '5+' | 'Unknown'
export type LibraryMode = 'grid' | 'series'

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
  /** include unowned (wishlist) books — the default grid shows only what the reader owns */
  wishlist: boolean
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
  sort: 'az',
})

/** Does any of the book's contributors match the given name (case/space-insensitive)? */
export function bookHasAuthor(b: Book, name: string): boolean {
  const key = normalizeName(name)
  if (!key) return true
  if (b.contributors.length) return b.contributors.some((c) => normalizeName(c.name) === key)
  return normalizeName(authorOf(b)) === key // back-compat for not-yet-joined books
}

/** A book counts as "read" if marked Read or it has any logged reads. */
export const isBookRead = (b: Book): boolean => b.readStatus === 'Read' || b.reads.length > 0

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
  // Collection scoping first: the grid is what you OWN unless the wishlist chip lets the rest in.
  if (!f.wishlist && b.ownership === 'unowned') return false
  if (f.sub !== 'All' && !bookSubgenres(b).includes(f.sub)) return false
  if (f.tags.length && !f.tags.every((t) => b.tags.includes(t))) return false
  if (f.status !== 'All' && b.status !== f.status) return false
  if (f.len !== 'Any' && seriesLenBucket(b) !== f.len) return false
  if (f.read !== 'All') {
    const read = isBookRead(b)
    if (f.read === 'Read' && !read) return false
    if (f.read === 'Unread' && (read || b.readStatus === 'Reading' || b.readStatus === 'DNF'))
      return false
    if (f.read === 'Reading' && b.readStatus !== 'Reading') return false
    if (f.read === 'DNF' && b.readStatus !== 'DNF') return false
  }
  if (f.format !== 'All' && b.format !== f.format) return false
  if (f.fave && !b.fave) return false
  if (f.intensity.length && !f.intensity.includes(b.intensity ?? 0)) return false
  if (f.author && !bookHasAuthor(b, f.author)) return false
  if (f.q) {
    const hay = [b.title, authorOf(b), b.series, ...b.tags, ...b.genres].join(' ').toLowerCase()
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
        (a, b) => (a.series || 'zzz').localeCompare(b.series || 'zzz') || positionOf(a) - positionOf(b),
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
      const total = sorted.find((b) => b.seriesCount != null)?.seriesCount ?? null
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
