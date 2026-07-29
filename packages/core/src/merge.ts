import type { Book, List, ReadEntry } from './types'
import { norm } from './normalize'
import { mergePossession } from './ownership'

/** The slice of library state the merge engine reads and rewrites. */
export interface LibraryState {
  books: Book[]
  tbrs: List[]
  collections: List[]
}

/** Duplicate-detection key: normalized title + author-last. */
export const dupKey = (b: Pick<Book, 'title' | 'last'>): string =>
  norm(b.title) + '|' + norm(b.last)

/** How complete a copy is — used to pick the primary in a duplicate group. Ported verbatim. */
export function richness(b: Book): number {
  return (
    (b.reads?.length ?? 0) * 3 +
    (b.cover ? 2 : 0) +
    (b.rating ? 1 : 0) +
    (b.fave ? 1 : 0) +
    (b.tags?.length ?? 0) * 0.2
  )
}

/** Groups of 2+ books that share a normalized title + author. */
export function findDuplicateGroups(books: readonly Book[]): Book[][] {
  const groups = new Map<string, Book[]>()
  for (const b of books) {
    const key = dupKey(b)
    const g = groups.get(key) ?? []
    g.push(b)
    groups.set(key, g)
  }
  return [...groups.values()].filter((g) => g.length > 1)
}

/**
 * Merge `otherIds` into `primaryId`: union reads (dedup by date), tags, and genres; keep
 * the best cover/rating/intensity/series info; remap list memberships onto the primary; drop the
 * losers. Pure port of the prototype's mergeBooks — returns a new LibraryState, mutates nothing.
 */
export function mergeBooks(
  state: LibraryState,
  primaryId: string,
  otherIds: string[],
): LibraryState {
  const byId = (id: string): Book | undefined => state.books.find((b) => b.id === id)
  const source = byId(primaryId)
  if (!source) return state

  const others = otherIds.map(byId).filter((b): b is Book => !!b && b.id !== primaryId)
  const all = [source, ...others]

  // Union reads, deduping by date (undated reads always carried).
  const reads: ReadEntry[] = []
  const seen = new Set<string>()
  for (const b of all) {
    for (const r of b.reads ?? []) {
      if (r.date) {
        if (!seen.has(r.date)) {
          seen.add(r.date)
          reads.push(r)
        }
      } else {
        reads.push(r)
      }
    }
  }

  const p: Book = { ...source }
  p.reads = reads
  p.tags = [...new Set(all.flatMap((b) => b.tags ?? []))]
  p.genres = [...new Set(all.flatMap((b) => b.genres ?? []))]
  p.fave = all.some((b) => b.fave)
  const intensities = all.map((b) => b.intensity).filter((x): x is number => x != null)
  p.intensity = intensities.length ? Math.max(...intensities) : null
  p.rating = p.rating || Math.max(...all.map((b) => b.rating || 0))
  p.progress = Math.max(...all.map((b) => b.progress || 0))
  p.cover = p.cover || all.map((b) => b.cover).find(Boolean) || ''
  p.isbn = p.isbn || all.map((b) => b.isbn).find(Boolean) || ''

  // Union ownership across copies (hardcover beats paperback beats generic).
  let physical: Book['owned']['physical'] = false
  for (const b of all) {
    const v = b.owned.physical
    if (v === 'hardcover') physical = 'hardcover'
    else if (v === 'paperback' && physical !== 'hardcover') physical = 'paperback'
    else if (v === true && physical === false) physical = true
  }
  p.owned = {
    physical,
    ebook: all.some((b) => b.owned.ebook),
    audiobook: all.some((b) => b.owned.audiobook),
  }
  // Possession is five independent signals now, so there is no single "strongest" to take: each
  // gets its own union rule (see mergePossession). The observable outcome is unchanged — a real
  // copy never loses to a wishlist duplicate, owning still beats borrowing, and a want the merge
  // satisfied stops being a want.
  Object.assign(p, mergePossession(all))

  // First non-empty value wins for these descriptive fields.
  if (!p.series) p.series = all.map((b) => b.series).find(Boolean) ?? p.series
  if (!p.position) p.position = all.map((b) => b.position).find(Boolean) ?? p.position
  if (!p.genre) p.genre = all.map((b) => b.genre).find(Boolean) ?? p.genre
  if (!p.subgenre) p.subgenre = all.map((b) => b.subgenre).find(Boolean) ?? p.subgenre
  // Union every side's subgenres, primary's order first; the single field mirrors element 0.
  p.subgenres = [
    ...new Set(
      all.flatMap((b) => (b.subgenres.length ? b.subgenres : b.subgenre ? [b.subgenre] : [])),
    ),
  ]
  p.subgenre = p.subgenres[0] ?? p.subgenre
  if (!p.format) p.format = all.map((b) => b.format).find(Boolean) ?? p.format

  if (p.seriesCount == null) {
    const v = all.map((b) => b.seriesCount).find((x) => x != null)
    if (v != null) p.seriesCount = v
  }
  if (!p.pub || !p.pub.y) {
    const pp = all.map((b) => b.pub).find((v) => v && v.y)
    if (pp) p.pub = pp
  }
  if (!p.plan) p.plan = all.map((b) => b.plan).find(Boolean) ?? null

  const statuses = all.map((b) => b.readStatus)
  p.readStatus =
    reads.length || statuses.includes('Read')
      ? 'Read'
      : statuses.includes('Reading')
        ? 'Reading'
        : statuses.includes('DNF')
          ? 'DNF'
          : statuses.includes('Unread')
            ? 'Unread'
            : p.readStatus

  const dead = new Set(others.map((b) => b.id))
  const remap = (ids: string[]): string[] => {
    const out: string[] = []
    for (const x of ids) {
      const next = dead.has(x) ? primaryId : x
      if (!out.includes(next)) out.push(next)
    }
    return out
  }

  return {
    books: state.books.filter((b) => !dead.has(b.id)).map((b) => (b.id === primaryId ? p : b)),
    tbrs: state.tbrs.map((l) => ({ ...l, ids: remap(l.ids) })),
    collections: state.collections.map((l) => ({ ...l, ids: remap(l.ids) })),
  }
}
