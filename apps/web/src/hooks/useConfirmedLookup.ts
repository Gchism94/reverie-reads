import { useEffect } from 'react'

/** Loading, found, or confirmed-absent — the three answers a param-addressed lookup actually has. */
export type Lookup<T> = { status: 'loading' } | { status: 'found'; value: T } | { status: 'absent' }

/** The slice of a `useQuery` result this needs. Structural, so any query shape fits. */
export interface LookupQuery {
  isFetchedAfterMount: boolean
  isFetching: boolean
  refetch: () => unknown
}

/**
 * Resolve "the thing this URL names" without ever reporting a stale absence.
 *
 * A route that reads `(lists ?? []).find(l => l.id === listId)` gets `undefined` for THREE different
 * situations — still loading, genuinely deleted, and *present on the server but missing from a cache
 * this client happens to be holding* — and every route in this app used to render the same terminal
 * "isn't here anymore" for all three. The third is the dangerous one, because the persisted query
 * cache makes it durable: `hydrate()` preserves `dataUpdatedAt`, so a restored snapshot can be
 * younger than `staleTime` and therefore FRESH. Fresh data does not refetch on mount, and
 * `refetchOnWindowFocus` is off — so the reader is told an existing shelf is gone and nothing ever
 * corrects it. That is reachable in production: any write from another device, or an app update that
 * reloads onto a snapshot taken moments before, lands a reader in exactly this state.
 *
 * The rule this encodes: **absence read out of a cache is a hypothesis, not a conclusion.** Before
 * telling a reader their shelf is gone, ask the server — and say "loading" until it answers.
 *
 * Costs one extra round trip ONLY on the miss path. A found lookup refetches nothing, so the common
 * case is unchanged.
 *
 * Terminates on a genuine deletion rather than refetching forever, and that rests on a specific
 * guarantee rather than on hope: `isFetchedAfterMount` is derived from `dataUpdateCount`, which
 * query-core increments on EVERY successful fetch (`query.js`: `dataUpdateCount: state
 * .dataUpdateCount + 1`, unconditional on the success action) — not only when the data changed. So a
 * refetch that returns the same empty list still flips it, and the second pass reports `absent`.
 */
export function useConfirmedLookup<T>(query: LookupQuery, value: T | undefined): Lookup<T> {
  const { isFetchedAfterMount, isFetching, refetch } = query
  const missing = value === undefined

  useEffect(() => {
    // Only when this client has NOT yet heard from the server during this mount. `isFetching` keeps
    // the initial in-flight load from being duplicated.
    if (missing && !isFetchedAfterMount && !isFetching) void refetch()
  }, [missing, isFetchedAfterMount, isFetching, refetch])

  if (value !== undefined) return { status: 'found', value }
  return isFetchedAfterMount ? { status: 'absent' } : { status: 'loading' }
}
