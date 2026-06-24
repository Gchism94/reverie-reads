import type { Book, Owned, ReadEntry } from './types'
import { norm } from './normalize'
import { deriveBoyfriend } from './boyfriend'

// ── ISBN normalization (match the same book whether it stored ISBN-10 or ISBN-13) ──

export const cleanIsbn = (raw: string): string => (raw || '').replace(/[^0-9Xx]/g, '').toUpperCase()

export function isbn10to13(isbn10: string): string {
  const c = cleanIsbn(isbn10)
  if (c.length !== 10) return ''
  const core = '978' + c.slice(0, 9)
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3)
  return core + ((10 - (sum % 10)) % 10)
}

/** Canonical ISBN-13 for matching (ISBN-10 promoted), or '' if not a usable ISBN. */
export function normalizeIsbn(raw: string): string {
  const c = cleanIsbn(raw)
  if (c.length === 13) return c
  if (c.length === 10) return isbn10to13(c)
  return ''
}

// ── Matching ──

export type MatchStrength = 'isbn' | 'title-author' | 'title-series-pos' | 'fuzzy' | 'none'
/** Strong matches auto-merge; fuzzy always routes to review. */
export const isStrong = (s: MatchStrength): boolean =>
  s === 'isbn' || s === 'title-author' || s === 'title-series-pos'

export type Incoming = Partial<Book> & { title: string }

const authorAuthorKey = (b: { title: string; last?: string }) => norm(b.title) + '|' + norm(b.last)
// Title with the subtitle (after :/– etc.) dropped, then normalized (strips punctuation + case).
const fuzzyTitle = (t: string) => norm(t.replace(/\s*[:–—-].*$/, ''))

export interface BookMatch {
  book: Book
  strength: MatchStrength
}

/**
 * Find the best existing library record for an incoming book. Priority: ISBN exact (10↔13
 * normalized) → normalized title+author → title+series+position → fuzzy (same author + title
 * equal ignoring subtitle/punctuation/case). Returns strength 'none' if nothing matches.
 * Matches only on real shared keys — enrichment may fill the incoming ISBN, but a match is
 * never fabricated.
 */
export function matchBook(incoming: Incoming, library: readonly Book[]): BookMatch {
  const inIsbn = normalizeIsbn(incoming.isbn ?? '')
  if (inIsbn) {
    const m = library.find((b) => normalizeIsbn(b.isbn) === inIsbn)
    if (m) return { book: m, strength: 'isbn' }
  }
  const inKey = authorAuthorKey({ title: incoming.title, last: incoming.last })
  const exact = library.find((b) => authorAuthorKey(b) === inKey)
  if (exact) return { book: exact, strength: 'title-author' }

  if (incoming.series) {
    const m = library.find(
      (b) =>
        !!b.series &&
        norm(b.title) === norm(incoming.title) &&
        norm(b.series) === norm(incoming.series ?? '') &&
        String(b.position) === String(incoming.position ?? ''),
    )
    if (m) return { book: m, strength: 'title-series-pos' }
  }

  if (incoming.last) {
    const inFuzzy = fuzzyTitle(incoming.title)
    const m = library.find(
      (b) =>
        norm(b.last) === norm(incoming.last) &&
        fuzzyTitle(b.title) === inFuzzy &&
        authorAuthorKey(b) !== inKey, // would have matched exactly above
    )
    if (m) return { book: m, strength: 'fuzzy' }
  }

  return { book: undefined as unknown as Book, strength: 'none' }
}

// ── Import merge: fold the incoming record INTO the existing one (existing row survives) ──

export interface ImportMergeResult {
  patch: Partial<Book> // field changes to apply to the existing record (empty = no-op)
  newReads: ReadEntry[] // incoming reads not already present (dedup by date)
  changed: boolean
}

function mergeOwned(existing: Owned, incoming?: Owned): Owned {
  if (!incoming) return existing
  return {
    // Keep the user's physical sub-type; only fill in if they don't own physical at all.
    physical: existing.physical !== false ? existing.physical : incoming.physical,
    ebook: existing.ebook || incoming.ebook,
    audiobook: existing.audiobook || incoming.audiobook,
  }
}

/**
 * Most-complete field values flow into the existing record; **user-authored fields always win**.
 * Single-value fields fill blanks only (existing kept when set). Multi-value fields union
 * (additive — never removes a curated trope/genre or turns off an owned flag). myRating, owned,
 * fave, plan, and progress are never overwritten. Reads dedupe by date. Idempotent: re-merging
 * identical data yields `changed: false`.
 */
export function mergeImport(existing: Book, incoming: Incoming): ImportMergeResult {
  const patch: Partial<Book> = {}

  const fill = <K extends 'first' | 'last' | 'series' | 'subgenre' | 'status' | 'cover' | 'isbn' | 'format' | 'source'>(
    k: K,
  ) => {
    if (!existing[k] && incoming[k]) patch[k] = incoming[k]
  }
  fill('first')
  fill('last')
  fill('series')
  fill('subgenre')
  fill('status')
  fill('cover')
  fill('isbn')
  fill('format')
  fill('source')

  if (existing.position === '' && incoming.position != null && incoming.position !== '') patch.position = incoming.position
  if (existing.seriesCount == null && incoming.seriesCount != null) patch.seriesCount = incoming.seriesCount
  if ((!existing.pub || !existing.pub.y) && incoming.pub?.y) patch.pub = incoming.pub
  if (!existing.spice && incoming.spice) patch.spice = incoming.spice
  if (!existing.rating && incoming.rating) patch.rating = incoming.rating // fill a blank rating only

  // Multi-value: union (additive).
  const tropes = [...new Set([...existing.tropes, ...(incoming.tropes ?? [])])]
  if (tropes.length !== existing.tropes.length) patch.tropes = tropes
  const genres = [...new Set([...existing.genres, ...(incoming.genres ?? [])])]
  if (genres.length !== existing.genres.length) patch.genres = genres

  const owned = mergeOwned(existing.owned, incoming.owned)
  if (JSON.stringify(owned) !== JSON.stringify(existing.owned)) patch.owned = owned

  // Reading status: only promote Unread → Read when the import shows it was read.
  if (existing.readStatus === 'Unread' && (incoming.readStatus === 'Read' || (incoming.reads?.length ?? 0) > 0)) {
    patch.readStatus = 'Read'
  }

  if (patch.tropes || patch.subgenre) {
    patch.boyfriend = deriveBoyfriend({
      tropes: patch.tropes ?? existing.tropes,
      subgenre: patch.subgenre ?? existing.subgenre,
    })
  }

  const haveDates = new Set(existing.reads.map((r) => r.date).filter(Boolean))
  const newReads = (incoming.reads ?? []).filter((r) => r.date && !haveDates.has(r.date))

  return { patch, newReads, changed: Object.keys(patch).length > 0 || newReads.length > 0 }
}
