import { mergeBooks } from './merge'
import type { Book } from './types'
import type { MergeFieldOption, MergeFieldPicks } from './mergeFieldPicker'

/**
 * Per-field control over a LIBRARY merge — the picker behind MergeDialog's preview, sibling of
 * `mergeFieldPicker` (the import-fold picker behind DuplicateReview). Same option/picks shapes,
 * same defaults contract (`take` is the ENGINE's answer), different engine underneath:
 * `mergeBooks` unions two of the reader's OWN rows, where `mergeImport` folds a foreign import
 * into one. That difference is why this is a second small table and not a fourth consumer of
 * `FILL_BLANK_FIELDS` — the import table's predicates encode import rules (never move a reader's
 * rating) that do not apply when both sides ARE the reader's.
 *
 * ── THE CEILING IS THE RPC ───────────────────────────────────────────────────────────────────────
 * merge_books applies p_fields key-by-key via coalesce (20260824010000). A field is offerable here
 * only if (a) that update list takes it, (b) `toBookRow` sends it, and (c) picking between two
 * values is meaningful. Excluded by construction, with the reason:
 *   · plan_*            — whole-or-not via the server's own `take_plan`; a pick would lie
 *   · series_user_chosen — DERIVED server-side (step 4a folds it when the loser's series wins)
 *   · position / seriesCount — NOT in the RPC's update list; series entries move in step 3c
 *   · tags/genres/subgenres unions, reads, moods, tropes, list memberships — union/carry semantics;
 *     nothing is discarded, so there is nothing to pick (same ruling as the import picker)
 *   · fave (OR), intensity/progress (max), possession flags (five-way union) — deliberate merge
 *     rules where "strongest survives"; offering the weaker value re-litigates a decided rule
 *   · subgenre/subgenres — the engine UNIONS the arrays (primary's order first) and derives the
 *     scalar from element 0; nothing is discarded, so there is nothing to pick
 *   · readStatus — DERIVED from the merged reads (reads present → 'Read', else the strongest
 *     status); a pick could assert 'Unread' over rows that carry reads
 *
 * ── ENGINE DEFAULTS, ENCODED HONESTLY ────────────────────────────────────────────────────────────
 * `mergeBooks` starts from `{...primary}` and then FILLS BLANKS for the descriptive fields —
 * series, genre, format, pub, rating, cover, isbn take the first non-empty value. Those carry
 * `fills: true` (an 'add' row defaults ON, matching the engine). title/author/status/source have
 * no fill rule: a blank primary stays blank, so their 'add' rows default OFF. Either way `take`
 * says what the engine does — the checkbox's initial state is never an editorial opinion.
 */

type Show = (b: Book) => string
interface BookMergeField {
  key: string
  label: string
  /** rendered value ('' = blank/unrenderable — the UI falls back to generic copy) */
  show: Show
  /** '' means blank for the differ/blank predicates (rating uses 0-as-blank via show) */
  blank: (b: Book) => boolean
  /** copy this field from `src` onto `out` — one human value, however many Book keys it spans */
  apply: (out: Book, src: Book) => void
  /** true = engine fills a blank primary from the loser (rating/cover/isbn only) */
  fills: boolean
}

const s = (v: string | null | undefined): string => (v ?? '').trim()
const pubShow: Show = (b) =>
  b.pub.y == null ? '' : [b.pub.y, b.pub.m, b.pub.d].filter((x) => x != null).join('-')

export const BOOK_MERGE_FIELDS: readonly BookMergeField[] = [
  {
    key: 'title',
    label: 'Title',
    fills: false,
    show: (b) => s(b.title),
    blank: (b) => !s(b.title),
    apply: (o, x) => {
      o.title = x.title
    },
  },
  {
    key: 'author',
    label: 'Author',
    fills: false,
    show: (b) => [s(b.first), s(b.last)].filter(Boolean).join(' '),
    blank: (b) => !s(b.first) && !s(b.last),
    // one human value spanning two columns — flips together, never half an author
    apply: (o, x) => {
      o.first = x.first
      o.last = x.last
    },
  },
  {
    key: 'series',
    label: 'Series',
    fills: true,
    show: (b) => s(b.series),
    blank: (b) => !s(b.series),
    // series NAME only: entries re-parent in the RPC's step 3c, and step 4a folds
    // series_user_chosen when this pick makes the loser's series win — by design, not by us
    apply: (o, x) => {
      o.series = x.series
    },
  },
  {
    key: 'genre',
    label: 'Genre',
    fills: true,
    show: (b) => s(b.genre),
    blank: (b) => !s(b.genre),
    apply: (o, x) => {
      o.genre = x.genre
    },
  },
  {
    key: 'status',
    label: 'Series status',
    fills: false,
    show: (b) => s(b.status),
    blank: (b) => !s(b.status),
    apply: (o, x) => {
      o.status = x.status
    },
  },
  {
    key: 'format',
    label: 'Format',
    fills: true,
    show: (b) => s(b.format),
    blank: (b) => !s(b.format),
    apply: (o, x) => {
      o.format = x.format
    },
  },
  {
    key: 'source',
    label: 'Source',
    fills: false,
    show: (b) => s(b.source),
    blank: (b) => !s(b.source),
    apply: (o, x) => {
      o.source = x.source
    },
  },
  {
    key: 'pub',
    label: 'Published',
    fills: true,
    show: pubShow,
    blank: (b) => b.pub.y == null,
    apply: (o, x) => {
      o.pub = { ...x.pub }
    },
  },
  {
    key: 'isbn',
    label: 'ISBN',
    fills: true,
    show: (b) => s(b.isbn),
    blank: (b) => !s(b.isbn),
    apply: (o, x) => {
      o.isbn = x.isbn
    },
  },
  {
    key: 'rating',
    label: 'Rating',
    fills: true,
    show: (b) => (b.rating ? `${b.rating}★` : ''),
    blank: (b) => !b.rating,
    apply: (o, x) => {
      o.rating = x.rating
    },
  },
  {
    key: 'cover',
    label: 'Cover',
    fills: true,
    // a URL is not a value a reader can compare — '' makes the UI use its generic copy, the same
    // ruling the import picker applies to its unrenderable fields
    show: () => '',
    blank: (b) => !s(b.cover),
    apply: (o, x) => {
      o.cover = x.cover
    },
  },
]

/**
 * The rows to render for one primary/loser pair. Only fields with something to decide appear:
 * equal values, or a blank loser, offer no choice and would be noise. `take` is what `mergeBooks`
 * itself will do — fill-blank fields default a blank primary to ON, everything else to the
 * primary's side (OFF).
 */
export function bookMergeOptions(primary: Book, loser: Book): MergeFieldOption[] {
  const out: MergeFieldOption[] = []
  for (const f of BOOK_MERGE_FIELDS) {
    if (f.blank(loser)) continue // nothing offered — nothing to decide
    if (f.blank(primary)) {
      out.push({
        key: f.key,
        label: f.label,
        mine: '',
        theirs: f.show(loser),
        kind: 'add',
        take: f.fills,
      })
      continue
    }
    // both set: for renderable fields, differ on the rendered value; the cover's '' vs '' would
    // read as equal, so unrenderable fields compare the underlying blank-ness path instead
    const differ =
      f.key === 'cover' ? primary.cover !== loser.cover : f.show(primary) !== f.show(loser)
    if (differ)
      out.push({
        key: f.key,
        label: f.label,
        mine: f.show(primary),
        theirs: f.show(loser),
        kind: 'replace',
        take: false,
      })
  }
  return out
}

/**
 * The merged Book to send, given the reader's picks.
 *
 * Starts from `mergeBooks`' own output — so with no picks, or with every row left at its default,
 * THE OUTPUT IS THE ENGINE'S OUTPUT, unchanged. That equivalence is the regression guarantee:
 * confirming a merge without touching anything (and every bulk merge in SettingsRoute, which
 * passes no picks) writes exactly what it wrote before the picker existed.
 */
export function applyBookMergePicks(primary: Book, loser: Book, picks: MergeFieldPicks = {}): Book {
  const merged =
    mergeBooks({ books: [primary, loser], tbrs: [], collections: [] }, primary.id, [loser.id])
      .books[0] ?? primary
  const out: Book = { ...merged }
  for (const opt of bookMergeOptions(primary, loser)) {
    const take = picks[opt.key] ?? opt.take
    if (take === opt.take) continue // default — the engine already decided it
    const field = BOOK_MERGE_FIELDS.find((f) => f.key === opt.key)
    if (!field) continue
    field.apply(out, take ? loser : primary)
  }
  return out
}
