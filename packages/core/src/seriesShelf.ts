// The series page IS the reading order (docs/task-series-experience.md). A series' canonical
// entries — including books the reader doesn't have yet, rendered as GHOST SLOTS — live on the
// series_entries relation; this module is the pure logic under that page: ordering, per-entry
// state, Next Up, progress, and the decimal positioning used by drag-reorder.
//
// One order per series by decision (see docs/decisions/0001-series-single-order.md): alternate
// orders (publication vs chronological) are deferred; an `order_variant` dimension would attach
// to the series-membership relation later.

import type { Book } from './types'
import { isBookRead } from './filters'
import { isPossessed } from './ownership'
import { normalizeName } from './contributors'
import { authorOf } from './normalize'

export interface SeriesEntry {
  id: string
  /** numeric, decimals first-class — #0.5 prequels and #2.5 novellas are real positions */
  position: number
  /** optional short tag rendered with the position badge: 'novella', 'prequel', … */
  label: string | null
  /** ghost display fields — a linked book renders from the book record instead */
  title: string
  author: string
  /** null = ghost slot (a canonical entry the reader doesn't have) */
  bookId: string | null
  source: 'manual' | 'hardcover'
  /**
   * A READER GESTURE placed this row — a drag, a hand-typed position, a manual add, a removal.
   * Source refreshes never touch it; manual order always wins.
   *
   * It does NOT mean "this row exists because of the reader". Reconciliation seeds an entry for
   * every library book naming the series, and those positions come from `seedSeriesPositions`, a
   * heuristic over `books.position` — machine output, not an arrangement. Seeding wrote `true` here
   * from ab9e1fe until fix/series-seed-provenance, which made every seeded row permanently immune
   * to source correction: opening a series page was enough to pin it forever.
   */
  userEdited: boolean
}

/** Entries in reading order (position, then title for stable ties). */
export const sortEntries = (entries: readonly SeriesEntry[]): SeriesEntry[] =>
  [...entries].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))

/** The reader's relationship to one slot: read ✓ / reading / on a TBR / in-hand-unread /
 *  wishlist ("to get" — a book you want or haven't sorted, not in hand) / ghost (not in the
 *  library at all — also "to get"). Borrowed books count as in hand ('unread', not 'wishlist'). */
export type EntryState = 'read' | 'reading' | 'tbr' | 'unread' | 'wishlist' | 'ghost'

export function entryState(book: Book | undefined, onTbr: boolean): EntryState {
  if (!book) return 'ghost'
  if (isBookRead(book)) return 'read'
  if (book.readStatus === 'Reading') return 'reading'
  if (onTbr) return 'tbr'
  if (!isPossessed(book)) return 'wishlist' // wishlist or unset — a slot still to acquire
  return 'unread'
}

/** An entry still ahead of the reader: a ghost, or a linked book that isn't read yet. */
const isAhead = (e: SeriesEntry, bookById: ReadonlyMap<string, Book>): boolean => {
  const b = e.bookId ? bookById.get(e.bookId) : undefined
  return !b || !isBookRead(b)
}

/** The first entry in order the reader hasn't finished — the page's emotional center. */
export function nextUp(
  entries: readonly SeriesEntry[],
  bookById: ReadonlyMap<string, Book>,
): SeriesEntry | null {
  return sortEntries(entries).find((e) => isAhead(e, bookById)) ?? null
}

/** The entry after the given book in reading order (the post-read chain prompt's target). */
export function entryAfterBook(
  entries: readonly SeriesEntry[],
  bookId: string,
  bookById: ReadonlyMap<string, Book>,
): SeriesEntry | null {
  const sorted = sortEntries(entries)
  const idx = sorted.findIndex((e) => e.bookId === bookId)
  if (idx === -1) return null
  return sorted.slice(idx + 1).find((e) => isAhead(e, bookById)) ?? null
}

export interface SeriesProgress {
  read: number
  total: number
  /** ghosts + wishlist copies — entries the reader still needs to acquire */
  toGet: number
}

export function seriesProgress(
  entries: readonly SeriesEntry[],
  bookById: ReadonlyMap<string, Book>,
): SeriesProgress {
  let read = 0
  let toGet = 0
  for (const e of entries) {
    const b = e.bookId ? bookById.get(e.bookId) : undefined
    if (b && isBookRead(b)) read++
    if (!b || !isPossessed(b)) toGet++ // ghost, wishlist, or unset — not in hand
  }
  return { read, total: entries.length, toGet }
}

/** "Read 3 of 7 · 2 to get" — the lockup line. */
export function progressLine(p: SeriesProgress): string {
  const base = `Read ${p.read} of ${p.total}`
  return p.toGet > 0 ? `${base} · ${p.toGet} to get` : base
}

/**
 * A position for a slot dropped between two neighbours. Prefers HUMAN decimals — between #2 and
 * #3 lands exactly 2.5, not 2.4999 — trying one decimal place, then two. When neighbours are too
 * tight for a clean value, the caller renumbers the whole list (renormalize silently, per task).
 */
export function positionBetween(
  prev: number | null,
  next: number | null,
): { position: number; renumber: boolean } {
  if (prev == null && next == null) return { position: 1, renumber: false }
  if (prev == null) {
    // before the first entry — #0.5-style prequel space; keep one clean decimal below
    const p = Math.round((next! - 1) * 10) / 10
    return p < next! ? { position: p, renumber: false } : { position: next! / 2, renumber: true }
  }
  if (next == null) return { position: Math.floor(prev) + 1, renumber: false }
  for (const decimals of [1, 2]) {
    const f = 10 ** decimals
    const mid = Math.round(((prev + next) / 2) * f) / f
    if (mid > prev && mid < next) return { position: mid, renumber: false }
  }
  return { position: (prev + next) / 2, renumber: true }
}

/** Integer renumber 1..n in current order — the silent renormalize when decimals get ugly. */
export function renumberEntries(entries: readonly SeriesEntry[]): SeriesEntry[] {
  return sortEntries(entries).map((e, i) => ({ ...e, position: i + 1 }))
}

/** One notion of title equality for every match in this module: trim + lowercase. */
const normTitle = (t: string): string => t.trim().toLowerCase()

/**
 * Entries with no book yet — the only ones ADOPTION may claim.
 *
 * This filter used to live inside `ghostMatchesBook` as an `e.bookId == null` clause. It is out here
 * now because the matcher below serves two populations and takes a narrow `{id, title, author}` that
 * has no `bookId` to check. Dropping it would let a book claim an entry that already belongs to a
 * DIFFERENT book — re-pointing that entry and silently orphaning the first book's slot — so it is a
 * real guard, not a tidy-up, and `series-removal-positions.spec.ts` holds it to that.
 */
export const unlinkedEntries = (entries: readonly SeriesEntry[]): SeriesEntry[] =>
  entries.filter((e) => e.bookId == null)

/** An entry that could claim a book: no linked book of its own, and a title/author to match on.
 *  Deliberately narrow — both call sites read the entry's own `author` DISPLAY STRING, never a
 *  contributor join. See `matchEntryForBook`. */
export interface ClaimableEntry {
  id: string
  title: string
  author: string
}

/** What a claim attempt resolved to. `ambiguous` is a REFUSAL, not a failure to find anything — the
 *  distinction matters to the caller, and to anyone reading a log. */
export type EntryMatch =
  | { kind: 'match'; entry: ClaimableEntry }
  | { kind: 'none' }
  | { kind: 'ambiguous'; candidates: ClaimableEntry[] }

/**
 * Which entry (if any) a library book should claim.
 *
 * ONE RULE, TWO POPULATIONS. Reconciliation asks this twice, in order:
 *   · ADOPTION — over live entries with no book (`unlinkedEntries`). A canonical ghost slot was
 *     seeded before the reader owned the book; the import landed later and should fill it.
 *   · REVIVE — over tombstones. A book naming the series again is the reader asking for it back, so
 *     a matching removed slot comes back rather than blocking: removal outlives a source refresh,
 *     not a deliberate re-add.
 * The populations differ and what a refusal COSTS differs, but the question — which of these
 * candidates is this book — is the same question, so it gets one answer here rather than two rules
 * that drift apart. Callers filter their own population and decide what a refusal means next.
 *
 * TITLE FIRST, AUTHOR AS A DISCRIMINATOR — NEVER AS A REQUIREMENT. A unique title match wins with
 * author unread. Author is consulted only to break a tie between two or more same-title candidates —
 * a reissue, an unmerged import duplicate, a translation. Requiring it would break the normal case
 * outright: an empty author is a LEGITIMATE state (the manual ghost path prompts "Author (optional):"
 * and stores '' when the reader declines; Hardcover stores '' when the upstream contribution is
 * missing), and adoption in particular exists because a catalog's author string almost never matches
 * the reader's byline character-for-character.
 *
 * AMBIGUITY REFUSES. If same-title candidates cannot be told apart by author — both empty, both
 * equal, or neither matching the book — nothing is claimed. Claiming the wrong one is worse than
 * claiming none, in both populations and for the same reason: a wrong revive resurrects a slot the
 * reader deliberately removed, and a wrong adoption links the book to a slot meant for a different
 * edition AND consumes the book before revive can correct it. A refusal costs the reader a slot they
 * can see and redo; a wrong claim is silent.
 *
 * NORMALIZATION IS DELIBERATELY PLAIN. `normalizeName` is trim + lowercase + whitespace-collapse and
 * nothing more, so it does NOT equate "Sarah J. Maas" with "Maas, Sarah J." or with "S. J. Maas".
 * That is a considered limit, not an oversight: here a normalization failure yields zero author
 * matches, which resolves to `ambiguous` → claim nothing → the safe direction. Inversion- or
 * initial-aware fuzziness would move failures toward the WRONG match instead (two different authors
 * sharing a surname), which is the outcome this function exists to avoid. It also keeps one notion of
 * name equality across the repo — `bookHasAuthor`, the contributors `name_key`, and the seed script
 * all normalize exactly this way.
 *
 * THE BOOK'S AUTHOR IS ITS DENORMALIZED `first`/`last` PAIR, not its contributor list, because that
 * is where an entry's `author` came from in the first place: reconciliation writes
 * `[author_first, author_last].join(' ')` onto the entry it creates. Comparing those two is comparing
 * like with like; a contributor name would mismatch on formatting for every reconciliation-created
 * row. `set_book_contributors` keeps the denormalized pair in sync on every contributor edit, so it
 * is not a staleness trade-off either.
 *
 * Callers hand `candidates` in a DETERMINISTIC order — both reconciliation passes read one query
 * ordered by `position, id` — so that even a genuinely tied outcome is reproducible run to run.
 */
export function matchEntryForBook(
  candidates: readonly ClaimableEntry[],
  book: Pick<Book, 'title' | 'first' | 'last'>,
): EntryMatch {
  const byTitle = candidates.filter((c) => normTitle(c.title) === normTitle(book.title))
  if (byTitle.length === 0) return { kind: 'none' }
  if (byTitle.length === 1) return { kind: 'match', entry: byTitle[0]! }

  const bookAuthor = normalizeName(authorOf(book))
  // An empty book author cannot discriminate anything — every comparison would be against ''.
  if (!bookAuthor) return { kind: 'ambiguous', candidates: byTitle }

  const byAuthor = byTitle.filter((c) => normalizeName(c.author) === bookAuthor)
  if (byAuthor.length === 1) return { kind: 'match', entry: byAuthor[0]! }
  return { kind: 'ambiguous', candidates: byTitle }
}

/** A library book waiting for its first series slot, as the reconciliation sees it. */
export interface SeedCandidate {
  id: string
  title: string
  /** books.position — an in-series index if the reader set it, but an import may put ANYTHING here */
  position: number | null
}

/**
 * No real series numbers its volumes past this. Imports (Hardcover, CSV) routinely park a GLOBAL
 * order number in books.position — 412, 1290 — and seeding those verbatim is what made series
 * positions look random. Above the ceiling we stop believing the field.
 */
const SERIES_POSITION_CEILING = 100

/**
 * Are these books' positions usable as the series' reading order? Judged as a SET, not per book:
 * one absurd value means the column is carrying something other than an in-series index, so none of
 * it can be trusted. Gaps are fine and meaningful (owning #1, #2, #5 says you're missing two).
 */
const positionsAreInSeriesIndices = (candidates: readonly SeedCandidate[]): boolean => {
  const seen = new Set<number>()
  for (const c of candidates) {
    if (c.position == null) continue // a gap in the data, not evidence against the rest
    if (!Number.isFinite(c.position) || c.position <= 0 || c.position > SERIES_POSITION_CEILING)
      return false
    if (seen.has(c.position)) return false // duplicate slots — an import artifact, not an order
    seen.add(c.position)
  }
  return true
}

/**
 * Positions for books joining a series, keyed by book id (docs/task-series-defects.md §3c).
 *
 * Believable in-series indices are KEPT — including their gaps, which carry real meaning. Anything
 * else (import global-order numbers, duplicates) is renumbered to a clean 1..n that PRESERVES the
 * relative order the numbers implied, so the reader's shelf reads sensibly instead of "#87, #412,
 * #1290". Books with no position at all sort last by title, so a null-position library gets a
 * deterministic order rather than whatever order the rows happened to come back in.
 *
 * `startAfter` is the current maximum live position: existing slots are never renumbered, so a book
 * arriving later appends instead of disturbing an arrangement the reader made.
 */
export function seedSeriesPositions(
  candidates: readonly SeedCandidate[],
  startAfter = 0,
): Map<string, number> {
  const ordered = [...candidates].sort(
    (a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.title.localeCompare(b.title),
  )
  const trusted = positionsAreInSeriesIndices(ordered)
  const out = new Map<string, number>()
  // Keeping believable indices means the append cursor has to clear them too, or a null-position
  // straggler would land on top of a slot we just honoured.
  let cursor = Math.floor(
    Math.max(startAfter, trusted ? Math.max(0, ...ordered.map((c) => c.position ?? 0)) : 0),
  )
  for (const c of ordered) {
    if (trusted && c.position != null) out.set(c.id, c.position)
    else out.set(c.id, ++cursor)
  }
  return out
}

/** A canonical slot as the source catalog reports it. */
export interface SourceSeriesEntry {
  position: number
  title: string
  author: string
}

/**
 * The non-overwrite merge (task §2): source data only FILLS GAPS. Unmatched catalog slots become
 * ghost inserts; a never-edited entry may follow the catalog's position; user-edited rows are
 * untouched; nothing is ever deleted.
 *
 * ── THE GATE IS `!userEdited` ALONE, and used to also require `source === 'hardcover'` ──────────
 * That second clause looked like provenance hygiene — "only a row the catalog created may be
 * repositioned by the catalog" — but the question the merge is actually asking is about the
 * POSITION, not the row: is this number something the reader authored? `userEdited` answers that
 * on its own. `source` answers a different question and answering it here made the merge unable to
 * correct exactly the rows that most need correcting.
 *
 * Concretely: reconciliation seeds `source: 'manual'` entries for library books, so requiring
 * `'hardcover'` meant a seeded row could never move no matter what `userEdited` said. Flipping
 * seeding to `user_edited: false` (fix/series-seed-provenance) would have changed NOTHING while
 * this clause stood — the row would have passed the first test and failed the second. Both halves
 * had to go together, and `packages/core/src/seriesShelf.test.ts` pinned the old rule explicitly
 * ("manual entry — must not move"), so the no-op would have shipped green.
 *
 * Nothing a reader creates is newly exposed by dropping it: every reader gesture writes
 * `user_edited: true` (see the audit in the PR), so `!userEdited` still protects picker adds, ghost
 * adds, drags, hand-set positions and tombstones. The only rows this newly admits are the seeded
 * ones, which is the point.
 */
export function mergeSourceEntries(
  existing: readonly SeriesEntry[],
  source: readonly SourceSeriesEntry[],
): { inserts: SourceSeriesEntry[]; moves: { id: string; position: number }[] } {
  const inserts: SourceSeriesEntry[] = []
  const moves: { id: string; position: number }[] = []
  for (const s of source) {
    if (!s.title) continue
    const match = existing.find((e) => normTitle(e.title) === normTitle(s.title))
    if (!match) {
      inserts.push(s)
      continue
    }
    if (!match.userEdited && s.position > 0 && match.position !== s.position) {
      moves.push({ id: match.id, position: s.position })
    }
  }
  return { inserts, moves }
}
