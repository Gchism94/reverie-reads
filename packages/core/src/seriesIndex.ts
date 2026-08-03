// The /series index's grouping logic (feat/series-builder). The index is author-grouped: a series
// files under every author who wrote any of its books, so a co-authored series appears twice, once
// under each name. Browsing (Library's Series mode) and ARRANGING (this) are different jobs and both
// exist by decision — this module is only the derivation under the arranging surface.
//
// Everything here is a pure derivation over data the books cache and series list already hold. There
// is deliberately no query: `useBooks` already embeds `book_authors(position, role, authors(name))`,
// so authorship is in memory before this runs. See the route for the cost note.

import { isAuthorRole, normalizeName } from './contributors'
import { authorOf } from './normalize'
import type { Book, Contributor } from './types'
import type { SeriesEntry } from './seriesShelf'

/**
 * A book's BYLINE authors — `author` and `co_author` only.
 *
 * The role filter matches `merge_books`' byline rule (its step 5 rebuilds `authors_display` from
 * exactly these two roles), so the index groups by the same notion of authorship the database uses
 * when it denormalizes a byline. Translators, illustrators, narrators and editors are contributors
 * but not authors, and filing a series under its translator would put it somewhere no reader looks
 * for it.
 *
 * Falls back to the denormalized `first`/`last` for books whose contributor join has not loaded or
 * never existed — the same back-compat shape `bookHasAuthor` uses, and for the same reason: books
 * predating the contributors join still have to appear somewhere.
 */
export function bylineAuthors(b: Book): { key: string; name: string }[] {
  const out: { key: string; name: string }[] = []
  const seen = new Set<string>()
  const push = (name: string) => {
    const key = normalizeName(name)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push({ key, name: name.trim() })
  }
  const byline = (b.contributors ?? []).filter((c: Contributor) => isAuthorRole(c.role))
  if (byline.length) {
    for (const c of [...byline].sort((x, y) => x.position - y.position)) push(c.name)
    return out
  }
  push(authorOf(b)) // pre-contributors book — the denormalized primary stands in
  return out
}

/** A ghost slot's author string, as an author key. Ghosts carry their own `author` text rather than
 *  a contributor join, so this is all there is to match on. */
const ghostAuthorKey = (e: SeriesEntry): string => normalizeName(e.author)

export interface SeriesInSection {
  /** the series NAME — series are identified by name app-wide */
  name: string
  /** library books in this series that carry this section's author */
  books: Book[]
}

export interface AuthorSection {
  /** normalized author name — the grouping key, stable across capitalisation and spacing */
  key: string
  /** display name, taken from the first spelling encountered in byline order */
  name: string
  series: SeriesInSection[]
}

/**
 * Which authors a series files under.
 *
 * Library books win: the union of their byline authors is the answer whenever there is one. GHOSTS
 * only get a vote when they agree with a library author already in the set, or when the series has
 * no library authors at all — an all-ghost series, where the ghost's own author string is the only
 * signal that exists.
 *
 * That asymmetry is the point. A ghost's author is free text on the entry row, not a join, so a
 * typo ("Nel Marrow") would otherwise spawn a phantom author section next to the real one and split
 * the series across both. Requiring a ghost to match, unless nothing else can answer, files it with
 * the series' other books instead — which is where the reader is looking.
 */
export function seriesAuthorKeys(
  seriesBooks: readonly Book[],
  entries: readonly SeriesEntry[],
): { key: string; name: string }[] {
  const fromBooks: { key: string; name: string }[] = []
  const seen = new Set<string>()
  for (const b of seriesBooks) {
    for (const a of bylineAuthors(b)) {
      if (seen.has(a.key)) continue
      seen.add(a.key)
      fromBooks.push(a)
    }
  }
  if (fromBooks.length) return fromBooks

  // All-ghost series: the entries' author strings are the only authorship on offer.
  const fromGhosts: { key: string; name: string }[] = []
  const ghostSeen = new Set<string>()
  for (const e of entries) {
    const key = ghostAuthorKey(e)
    if (!key || ghostSeen.has(key)) continue
    ghostSeen.add(key)
    fromGhosts.push({ key, name: e.author.trim() })
  }
  return fromGhosts
}

/**
 * The index: every author who has a series, each with their series sorted by name.
 *
 * `seriesNames` carries series that exist as rows but have no library books yet (an all-ghost series
 * seeded from the catalog), with their entries, so those are not invisible here. Series are sorted
 * by name and authors by display name — one order, no toggle.
 */
export function groupSeriesByAuthor(
  books: readonly Book[],
  entriesBySeries: ReadonlyMap<string, readonly SeriesEntry[]> = new Map(),
): AuthorSection[] {
  // series name (as written) -> its library books
  const booksBySeries = new Map<string, Book[]>()
  for (const b of books) {
    const name = (b.series ?? '').trim()
    if (!name) continue
    const list = booksBySeries.get(name)
    if (list) list.push(b)
    else booksBySeries.set(name, [b])
  }
  // series rows with entries but no library books still belong in the index
  for (const name of entriesBySeries.keys())
    if (!booksBySeries.has(name)) booksBySeries.set(name, [])

  const byAuthor = new Map<string, AuthorSection>()
  for (const [name, seriesBooks] of booksBySeries) {
    const entries = entriesBySeries.get(name) ?? []
    for (const a of seriesAuthorKeys(seriesBooks, entries)) {
      const section = byAuthor.get(a.key) ?? { key: a.key, name: a.name, series: [] }
      section.series.push({ name, books: seriesBooks })
      byAuthor.set(a.key, section)
    }
  }

  return [...byAuthor.values()]
    .map((s) => ({ ...s, series: [...s.series].sort((x, y) => x.name.localeCompare(y.name)) }))
    .sort((x, y) => x.name.localeCompare(y.name))
}

/**
 * The tokens the arranger's rows paint with, named here rather than only in the component so the
 * contrast test and the styling read from ONE object. Measuring `--card-solid` while the component
 * quietly renders an rgba scrim would be a green test over an illegible row — the trap
 * `statePill.contrast.test.ts` was written to close, kept closed the same way.
 */
export const SERIES_ARRANGER_TOKENS = {
  surface: 'var(--card)',
  title: 'var(--ink)',
  /** position "#N", the ghost author line, the grip, and the ▲▼ glyphs */
  meta: 'var(--muted)',
} as const

/** Which `SKIN_TOKENS` field backs each of the above — the contrast test's map from CSS var to fixture. */
export const SERIES_ARRANGER_TOKEN_FIELDS = {
  surface: 'cardSolid',
  title: 'ink',
  meta: 'muted',
} as const

/**
 * What a drop resolves to: a reorder within one list, a no-op, or a refusal.
 *
 * This is a pure function so the REFUSAL has a test of its own. In the UI each series owns its own
 * `DndContext` and resolves targets with `pointerWithin`, so a foreign id should never arrive — but
 * "cannot arrive" and "is refused" are different claims, and only one of them survives a change to
 * the collision strategy. `series_entries` ids are unique across the whole account, so a foreign id
 * reaching the reorder path would find `indexOf === -1`; an unguarded caller turns that into a silent
 * no-op, which is the bug shape that reads as "drag sometimes does nothing".
 *
 * Moving a book BETWEEN series is not a reorder at all — it rewrites `books.series` and tombstones
 * the old slot, which is the book page's series field's job.
 */
export type ReorderResolution =
  | { kind: 'reorder'; from: number; to: number }
  | { kind: 'noop' }
  | { kind: 'reject'; reason: 'foreign-series' }

export function resolveReorder(
  ids: readonly string[],
  activeId: string,
  overId: string | null,
): ReorderResolution {
  if (!overId || activeId === overId) return { kind: 'noop' }
  const from = ids.indexOf(activeId)
  const to = ids.indexOf(overId)
  if (from === -1 || to === -1) return { kind: 'reject', reason: 'foreign-series' }
  return { kind: 'reorder', from, to }
}

/**
 * The total a series row displays, by SeriesView's rule — `canonicalTotal ?? group.total` — so the
 * two surfaces cannot disagree about how long a series is.
 *
 * There is no single canonical total in the schema: `books.series_count` (per book), the live entry
 * count, and nothing at all on the `series` row are three sources that can each answer differently.
 * SeriesView already reconciles them this way and this defers to it rather than inventing a fourth.
 * `canonicalTotal` is the entry count, and only counts when it EXCEEDS what the shelf holds — the
 * same guard SeriesView applies at its call site.
 */
export function displayTotal(
  seriesCountFromBooks: number | null,
  entryCount: number | null,
  ownedCount: number,
): number | null {
  const canonical = entryCount != null && entryCount > ownedCount ? entryCount : null
  return canonical ?? seriesCountFromBooks
}
