import { matchBook, norm, workKeyOf, type Book } from '@reverie/core'
import { resultToIncoming, type SearchResult } from './search'
import type { WorkRow } from '../data/works'

/**
 * ADD-SEARCH TRIAGE — is this catalog result something the reader already has, something the
 * corpus already describes, or genuinely new?
 *
 * Pure on purpose: `(results, library, corpus) → labelled results`, no React, no network, no
 * ordering dependence. The reason readers re-add books they own and hand-fill books the corpus
 * could prefill is that the Add list said nothing about either; the DECIDING is the part worth
 * testing, and it is testable without a browser.
 *
 * TAKES `SearchResult[]`, NOT Add's own five-field `SearchHit[]`. The hit drops `series` and
 * `seriesPosition`, and those are exactly the fields matchBook's `title-series-pos` leg reads —
 * classifying after that truncation would silently disable one of the matcher's four legs while
 * still looking like it worked.
 *
 * NORMALIZERS ARE IMPORTED, NEVER REIMPLEMENTED (corpus-import-lib's rule, and it applies here for
 * the same reason): `norm`, `matchBook` and `workKeyOf` are core's. A local copy of any of them
 * would drift from the importer that writes `works.work_key` and from the intake that decides a
 * duplicate, and the drift would show up as a lookup that quietly never matches.
 */

/** Which of the three states a result is in. A result can be in the library AND the corpus; the
 *  library half wins the primary action, so it leads the state and the corpus half rides along. */
export type TriageState = 'library' | 'corpus' | 'new'

export interface TriagedResult {
  result: SearchResult
  state: TriageState
  /** the reader's existing book, when `state` is 'library' — the "Open it" target */
  book: Book | null
  /** the corpus row describing this result, when there is one. Present on 'corpus' AND on
   *  'library'-plus-corpus, because the copy names both rather than dropping the corpus half. */
  work: WorkRow | null
}

/**
 * THE EMPTY-LAST-NAME GUARD.
 *
 * `matchBook`'s title-author leg keys on `norm(title) + '|' + norm(last)`. `resultToIncoming`
 * derives `last` by splitting the author on whitespace and dropping the first word — so a
 * single-word author ('Homer', 'Ovid') or a catalog row with no author at all yields `last: ''`
 * and a key of `` `title|` ``, which matches ANY library book that also has no last name. That is
 * a false "you already own this", and it is the worst of the three states to get wrong: it does
 * not merely mislabel the row, it withholds the add control for a book the reader does not have.
 *
 * Same defect the works e2e caught in `ownedKeys` — authorless books hashed as `title|` and so
 * escaping "Hide what I have" (fixed in #340). Second instance, different surface.
 *
 * The guard does NOT drop such a result to 'new' outright: matchBook's ISBN and title-series-pos
 * legs never look at the author and stay sound. So when `last` normalizes to empty and the matcher
 * came back on the title-author leg, it is re-asked against the library MINUS the authorless books
 * — the only rows that can produce the `title|` collision. Against that subset the title-author leg
 * is structurally unable to fire (every remaining key ends in a non-empty last, the incoming key
 * ends in nothing) and the fuzzy leg is already gated behind `incoming.last`, so whatever comes
 * back is ISBN or title+series+position evidence, which is what we wanted to keep.
 *
 * The one thing this gives up is a title-series-position match against a library book that ALSO has
 * no author. That trade is deliberate and one-directional: under-claiming shows an add control for
 * a book the reader has (recoverable — intake still de-dupes on save), over-claiming hides the add
 * control for a book they do not (not recoverable from the reader's side).
 */
function libraryHit(r: SearchResult, library: readonly Book[]): Book | null {
  const inc = resultToIncoming(r)
  const m = matchBook(inc, library)
  if (m.strength === 'none') return null
  if (m.strength !== 'title-author' || norm(inc.last)) return m.book
  const authored = library.filter((b) => !!norm(b.last))
  const retry = matchBook(inc, authored)
  return retry.strength === 'none' ? null : retry.book
}

/** The corpus identity of a catalog result: normalized title + normalized FULL author name — core's
 *  `workKeyOf`, the same function the corpus importer writes `works.work_key` with. Empty when the
 *  result has no author or no title, so it can never key as `` `title|` `` and collide with every
 *  authorless corpus row — the library-side trap above, on the other side of the join. */
export function resultWorkKey(r: SearchResult): string {
  const author = (r.authors[0] ?? '').trim()
  if (!norm(author) || !norm(r.title)) return ''
  return workKeyOf({ title: r.title, last: author })
}

/**
 * A corpus row's identity — DERIVED from its own title + author, and its stored `work_key` too.
 *
 * `works.work_key` is documented as "enrichment_cache.work_id when the work has been resolved, else
 * the normalized title|author pair" — two possible shapes in one column. Deriving gives the same
 * answer as the importer for every row the importer wrote, and still matches a row whose stored key
 * took the work_id shape; checking both means neither shape is a silent miss. Rows with no author
 * contribute only their stored key, never a `` `title|` `` derived one.
 */
export function workRowKeys(w: WorkRow): string[] {
  const author = (w.contributors ?? []).map((c) => c.name).find((n) => !!norm(n)) ?? ''
  const derived = norm(author) && norm(w.title) ? workKeyOf({ title: w.title, last: author }) : ''
  return [derived, w.work_key].filter((k): k is string => !!k)
}

/**
 * Label every result.
 *
 * `corpus` may be null while its query is still in flight — results are then labelled on the
 * library alone and gain their corpus half when it resolves. That is what keeps the list from
 * waiting on a second round trip to render at all, which on a fast connection is a regression
 * nobody would see.
 */
export function triageResults(
  results: readonly SearchResult[],
  library: readonly Book[],
  corpus: readonly WorkRow[] | null | undefined,
): TriagedResult[] {
  const byKey = new Map<string, WorkRow>()
  for (const w of corpus ?? []) for (const k of workRowKeys(w)) if (!byKey.has(k)) byKey.set(k, w)

  return results.map((result) => {
    const book = libraryHit(result, library)
    const rk = resultWorkKey(result)
    const work = (rk ? byKey.get(rk) : undefined) ?? null
    return { result, book, work, state: book ? 'library' : work ? 'corpus' : 'new' }
  })
}

/**
 * The reader-facing line for a state. TEXT — never colour alone, never an icon alone; the state has
 * to survive greyscale, a colour-blind reader and a screen reader equally. (It also must not ride
 * `--accent-fill`, which measures 1.00:1 against `--card` in almanac/dark.)
 *
 * The both-states case NAMES both rather than silently dropping the corpus half: the library wins
 * the primary action, but "the corpus has a full record for this too" is the reason a reader might
 * still want the corpus prefill, so it stays visible.
 */
export function triageLabel(t: Pick<TriagedResult, 'state' | 'work'>): string {
  if (t.state === 'library')
    return t.work ? 'In your library · also in the corpus' : 'In your library'
  if (t.state === 'corpus') return 'In the corpus'
  return 'New to your library'
}
