import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeBook } from './book.fixture'
import { defaultFilters, matchesFilters, sortBooks } from './filters'
import type { Book } from './types'

/**
 * NULL vs 0, driven by the REAL library rather than a hand-built fixture.
 *
 * The ruling (owner, 2026-08-21): `null` = not assessed, `0` = assessed as none, and the two are
 * never collapsed. Three call sites disagreed — matchesFilters read null AS 0, sortBooks ranked it
 * BELOW 0, and the seeder fabricated 0 for a missing value.
 *
 * WHY THE CORPUS FILE AND NOT A FIXTURE. A synthetic three-book library can be made to pass
 * whatever the code happens to do. `data/corpus_seed.json` is the actual bibliographic data this
 * app ships and seeds from, so the assessed side of these assertions is a real distribution
 * nobody chose for the test's convenience.
 *
 * AND THE HONEST LIMIT OF THAT FILE, stated rather than papered over: it contains NO unassessed
 * books — all 290 carry an explicit `spice`. So the corpus alone cannot exercise the null side at
 * all, which is exactly why the defect survived this long. The unassessed population is therefore
 * constructed here, sized to what the live database actually held when the ruling was made
 * (179 null against 535 zero) so the proportions under test are the real ones.
 *
 * ── MUTATION RESULTS, INCLUDING THE ONE THAT SURVIVED ────────────────────────────────────────────
 * Three mutants were run against this file:
 *   · matchesFilters back to `?? 0`        → KILLED (2 failures) — the filter tests have teeth
 *   · the partition dropping its unassessed → KILLED (2 failures) — the sort tests guard the
 *                                              new implementation's own failure mode
 *   · sortBooks back to the `?? -1` sentinel → **SURVIVED — all 10 passed**
 *
 * That third result is reported rather than hidden, because it says something true: under the
 * CURRENT descending comparator, `?? -1` and the partition produce identical output. Ranking null
 * at -1 already places it after every 0. So the sort was never emitting a wrong order, and the
 * change to a partition is a statement of intent and a direction-proofing, NOT a behaviour fix —
 * the same expression under an ascending sort would put every unassessed book first, and no test
 * here can distinguish the two until someone writes that variant. The tests below are kept because
 * they pin the CONTRACT (unassessed last, nothing dropped) against future edits; they are not
 * evidence that the old sort was broken, and should not be read as such.
 */

interface CorpusRow {
  title: string
  spice?: number
  intensity?: number
}
const CORPUS: CorpusRow[] = JSON.parse(
  readFileSync(join(__dirname, '../../../data/corpus_seed.json'), 'utf8'),
) as CorpusRow[]

const assessed: Book[] = CORPUS.map((r, i) =>
  makeBook({ id: `c${i}`, title: r.title, intensity: r.spice ?? r.intensity ?? null }),
)
/** Measured on the live DB at the time of the ruling: 179 books carry a null intensity. */
const UNASSESSED_COUNT = 179
const unassessed: Book[] = Array.from({ length: UNASSESSED_COUNT }, (_, i) =>
  makeBook({ id: `u${i}`, title: `Unassessed ${i}`, intensity: null }),
)
const library = [...assessed, ...unassessed]

const countAt = (v: number | null) =>
  assessed.filter((b) => b.intensity === v).length + (v === null ? UNASSESSED_COUNT : 0)

const filterBy = (levels: (number | null)[]) =>
  library.filter((b) => matchesFilters(b, { ...defaultFilters(), intensity: levels }))

describe('the corpus is what this test claims it is', () => {
  it('carries 290 books, none of them unassessed — so the null side had no coverage before', () => {
    expect(assessed).toHaveLength(290)
    expect(assessed.filter((b) => b.intensity === null)).toHaveLength(0)
  })

  it('has the real assessed distribution: 266 at none, 2/16/6 across levels 3-5', () => {
    expect(countAt(0)).toBe(266)
    expect(countAt(3)).toBe(2)
    expect(countAt(4)).toBe(16)
    expect(countAt(5)).toBe(6)
    expect(countAt(1) + countAt(2)).toBe(0)
  })
})

describe('matchesFilters — the collapse that made 0 and null the same book', () => {
  it('selecting "none" (0) returns the 266 assessed-as-none books and NOT the 179 unassessed', () => {
    const hit = filterBy([0])
    expect(hit).toHaveLength(266)
    expect(hit.every((b) => b.intensity === 0)).toBe(true)
  })

  it('selecting "not assessed" (null) returns the 179 unassessed and NOT the 266 zeroes', () => {
    const hit = filterBy([null])
    expect(hit).toHaveLength(UNASSESSED_COUNT)
    expect(hit.every((b) => b.intensity === null)).toBe(true)
  })

  it('the two selections are disjoint and together cover 445 books — no double counting', () => {
    const zero = new Set(filterBy([0]).map((b) => b.id))
    const nul = new Set(filterBy([null]).map((b) => b.id))
    expect([...zero].some((id) => nul.has(id))).toBe(false)
    expect(filterBy([0, null])).toHaveLength(266 + UNASSESSED_COUNT)
  })

  it('every book in the library is now reachable by SOME selection — 445 were not, before', () => {
    const all = filterBy([null, 0, 1, 2, 3, 4, 5])
    expect(all).toHaveLength(library.length)
  })

  it('a level selection still excludes both 0 and null, as it always did', () => {
    const hit = filterBy([4, 5])
    expect(hit).toHaveLength(16 + 6)
    expect(hit.every((b) => b.intensity != null && b.intensity >= 4)).toBe(true)
  })
})

describe('sortBooks — unassessed goes LAST, not below zero', () => {
  const sorted = sortBooks(library, 'intensity')

  it('orders the assessed side high to low', () => {
    const levels = sorted
      .filter((b) => b.intensity != null)
      .map((b) => b.intensity as number)
      .slice(0, 30)
    expect(levels).toEqual([...levels].sort((a, b) => b - a))
  })

  it('puts every unassessed book after every assessed one, including the zeroes', () => {
    const firstUnassessed = sorted.findIndex((b) => b.intensity == null)
    const lastAssessed = sorted.map((b) => b.intensity).lastIndexOf(0)
    expect(firstUnassessed).toBeGreaterThan(lastAssessed)
    expect(sorted.slice(firstUnassessed).every((b) => b.intensity == null)).toBe(true)
  })

  it('keeps every book — a partition must not drop the population it splits', () => {
    expect(sorted).toHaveLength(library.length)
    expect(new Set(sorted.map((b) => b.id)).size).toBe(library.length)
  })
})
