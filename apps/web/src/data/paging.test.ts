import { describe, expect, it } from 'vitest'
import { PAGE, pageAll } from './paging'

/**
 * `pageAll`'s own behaviour, at its new home. The call sites are covered exhaustively by
 * pagingCoverage.test.ts (does every read page?); this covers what paging DOES (does it return
 * everything, and does it fail loudly when it cannot?).
 *
 * The fake caps like PostgREST does and reports `count` as the size of the whole match. A fake that
 * simply returned what was asked for would pass with the paging deleted.
 */
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ i }))

/** A well-behaved server: honours the window, caps the response, counts the whole match. */
const server =
  (all: { i: number }[], opts: { ignoreRange?: boolean } = {}) =>
  (from: number, to: number) => {
    const page = opts.ignoreRange
      ? all.slice(0, PAGE)
      : all.slice(from, to + 1).slice(0, PAGE)
    return Promise.resolve({ data: page, error: null, count: all.length })
  }

describe('pageAll returns the whole result set', () => {
  it('returns every row when there are more than one page', async () => {
    const got = await pageAll('books', server(rows(2500)))
    expect(got).toHaveLength(2500)
    // Not just the count — a loop that re-read page one would also reach 2500 against a lazier fake.
    expect(got.at(-1)).toEqual({ i: 2499 })
    expect(new Set(got.map((r) => r.i)).size).toBe(2500)
  })

  it('handles the exact-one-page boundary, where a full page is not evidence of the last page', async () => {
    expect(await pageAll('books', server(rows(PAGE)))).toHaveLength(PAGE)
  })

  it('handles an empty set and a single short page', async () => {
    expect(await pageAll('books', server(rows(0)))).toHaveLength(0)
    expect(await pageAll('books', server(rows(498)))).toHaveLength(498) // the library today
  })

  it('returns the library size the corpus import will produce', async () => {
    // 498 + 875 = 1,373: the number that makes this urgent rather than theoretical.
    expect(await pageAll('books', server(rows(1373)))).toHaveLength(1373)
  })
})

describe('pageAll fails loudly rather than returning a partial answer', () => {
  it('TERMINATES and throws when the read never advances, instead of hanging', async () => {
    // The second failure mode, and the one that does not look like truncation: with the window
    // ignored, every request returns page one. Unbounded, this accumulates duplicates until the
    // tab runs out of memory — it was found by writing exactly this test and watching it OOM.
    await expect(pageAll('books', server(rows(2500), { ignoreRange: true }))).rejects.toThrow(
      /Paging did not advance for books/,
    )
  })

  it('throws when the read comes back SHORT of the server’s count', async () => {
    // A server that reports 2,500 but serves one short page — the truncation shape.
    const short = () => Promise.resolve({ data: rows(10), error: null, count: 2500 })
    await expect(pageAll('books', short)).rejects.toThrow(/Read 10 of 2500 books rows/)
  })

  it('names the read, so the error says WHICH one failed', async () => {
    const short = () => Promise.resolve({ data: rows(1), error: null, count: 99 })
    await expect(pageAll('book_tropes', short)).rejects.toThrow(/book_tropes/)
  })

  it('propagates a query error untouched rather than reporting a short read', async () => {
    const boom = () => Promise.resolve({ data: null, error: new Error('rls denied'), count: null })
    await expect(pageAll('books', boom)).rejects.toThrow(/rls denied/)
  })

  it('accepts a server that reports no count, without inventing a failure', async () => {
    // Not every client surfaces `count`. Absent one, the short-page rule is the only signal — the
    // helper must still work, not throw because it cannot verify.
    const noCount = (from: number, to: number) =>
      Promise.resolve({ data: rows(2500).slice(from, to + 1).slice(0, PAGE), error: null, count: null })
    expect(await pageAll('books', noCount)).toHaveLength(2500)
  })
})
