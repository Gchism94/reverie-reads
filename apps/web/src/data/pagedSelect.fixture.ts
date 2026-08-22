/**
 * A stand-in for a PostgREST select that PAGES — the chain `pageAll` builds:
 * `.select(cols, { count })` → `.order(…)*` → `.eq(…)*` → `.range(from, to)` → await.
 *
 * One helper rather than six near-identical stubs. Before this, each suite's `vi.mock` returned a
 * bare promise from `select()`, so the first paged read broke all of them at once with
 * "`.order` is not a function" — and had each been patched separately they would have drifted, each
 * modelling paging slightly differently and none of them modelling the cap.
 *
 * It caps at PAGE and reports `count` as the size of the WHOLE match, so a caller that pages
 * correctly sees every row and one that does not is short — the behaviour under test, not a
 * convenience that always says yes.
 */
import { PAGE } from './paging'

export function pagedSelect<T>(source: T[] | (() => T[])) {
  const all = () => (typeof source === 'function' ? source() : source)
  let window: [number, number] | null = null
  const q = {
    select: () => q,
    order: () => q,
    eq: () => q,
    neq: () => q,
    is: () => q,
    not: () => q,
    in: () => q,
    range: (from: number, to: number) => {
      window = [from, to]
      return q
    },
    then: <A, B = never>(
      ok?: ((v: { data: T[]; error: null; count: number }) => A | PromiseLike<A>) | null,
      err?: ((r: unknown) => B | PromiseLike<B>) | null,
    ): PromiseLike<A | B> => {
      const rows = all()
      const page = window
        ? rows.slice(window[0], window[1] + 1).slice(0, PAGE)
        : rows.slice(0, PAGE)
      return Promise.resolve({ data: page, error: null as null, count: rows.length }).then(ok, err)
    },
  }
  return q
}
