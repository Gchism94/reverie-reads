import { useInfiniteQuery } from '@tanstack/react-query'
import type { Contributor } from '@reverie/core'
import { supabase } from '../lib/supabase'
import { DISCOVER_BATCH, type DiscoverHit } from '../lib/discover'

/**
 * The corpus browse — a plain client select from `works`.
 *
 * No edge function on purpose: the works table's RLS is read-all-authenticated (its whole read
 * model), so PostgREST + .range() IS the pagination server, and adding a fn here would be a hop
 * that caches nothing and gates nothing. Contrast with the external shelf, which proxies Google
 * through the `releases` fn precisely because THAT source needs a shared cache and a key fence.
 */

export interface WorksFilters {
  /** canonical lowercased genre token, '' = all */
  genre: string
  /** exact tag membership (works.tags is lowercased at import), '' = all */
  tag: string
  /** title/author substring, '' = none */
  q: string
}

export interface WorkRow {
  work_key: string
  title: string
  contributors: Contributor[]
  series: string | null
  position: number | null
  cover_url: string | null
  genre: string | null
  tags: string[]
  pub_y: number | null
  pub_m: number | null
  pub_d: number | null
}

const COLS = 'work_key, title, contributors, series, position, cover_url, genre, tags, pub_y, pub_m, pub_d'

/** Page N's inclusive row range — pure, so the paging arithmetic is testable without a client. */
export const worksPageRange = (page: number): { from: number; to: number } => ({
  from: page * DISCOVER_BATCH,
  to: page * DISCOVER_BATCH + DISCOVER_BATCH - 1,
})

/**
 * Apply the browse filters to any works query builder. Generic over the builder so the unit test
 * hands in a recorder and asserts the CALLS — the composition logic is what can rot (a dropped
 * branch, a swapped operator), and it is testable without a database. fetchWorksPage below runs
 * THROUGH this function; a second copy of the filter logic is exactly the drift this shape exists
 * to prevent.
 *
 * Text search matches title OR author_text — the denormalized column the migration carries
 * precisely because PostgREST cannot substring-search the contributors jsonb. `%` and `,` are
 * stripped from the term rather than escaped: PostgREST's .or() syntax treats commas as
 * separators, and a literal % in a reader's search is noise, not a wildcard request.
 */
export function applyWorksFilters<
  T extends {
    eq(col: string, v: string): T
    contains(col: string, v: string[]): T
    or(expr: string): T
  },
>(query: T, f: WorksFilters): T {
  let q = query
  if (f.genre) q = q.eq('genre', f.genre)
  if (f.tag) q = q.contains('tags', [f.tag.toLowerCase()])
  const term = f.q.trim().replace(/[%,]/g, '')
  if (term) q = q.or(`title.ilike.%${term}%,author_text.ilike.%${term}%`)
  return q
}

/** works row → the Discover card contract. A corpus pick IS an Add prefill, same as an external
 *  hit — authors from contributors, isbn deliberately '' (the corpus stores none yet), pub from
 *  pub_y so the card's year renders. cover may be '' for months; CoverPlaceholder is the designed
 *  common case at launch, not an error state. */
export function workToHit(w: WorkRow): DiscoverHit {
  const pub = [w.pub_y, w.pub_m, w.pub_d]
    .filter((x): x is number => x != null)
    .map((x, i) => (i === 0 ? String(x) : String(x).padStart(2, '0')))
    .join('-')
  return {
    title: w.title,
    authors: (w.contributors ?? []).map((c) => c.name).filter(Boolean),
    cover: w.cover_url ?? '',
    isbn: '',
    pub,
  }
}

type Filterable = {
  eq(col: string, v: string): Filterable
  contains(col: string, v: string[]): Filterable
  or(expr: string): Filterable
}

async function fetchWorksPage(f: WorksFilters, page: number): Promise<WorkRow[]> {
  const { from, to } = worksPageRange(page)
  const base = supabase.from('works').select(COLS)
  // One logic path: the same applyWorksFilters the unit tests drive. The structural cast exists
  // because supabase's builder generics recurse past tsc's instantiation depth when fed through a
  // generic constraint (TS2589); the runtime object is unchanged either side of it.
  const query = applyWorksFilters(base as unknown as Filterable, f) as unknown as typeof base
  const { data, error } = await query.order('title', { ascending: true }).range(from, to)
  if (error) throw error
  return (data ?? []) as unknown as WorkRow[]
}

/**
 * ACCUMULATES, deliberately unlike the external shelf's batchOf() CYCLING one section down.
 * The external shelf pages a FIXED pool of ~60 cached hits, so "new batch" REPLACES twenty with
 * the next twenty and wraps. The corpus browse walks a GROWING table, so "show more" APPENDS the
 * next DISCOVER_BATCH and the reader scrolls an ever-longer shelf. Same page size, opposite
 * accumulation — the comment exists because the two sit near each other in DiscoverRoute and the
 * difference is a decision, not an accident.
 */
export function useWorksBrowse(filters: WorksFilters) {
  return useInfiniteQuery({
    queryKey: ['works-browse', filters.genre, filters.tag, filters.q],
    queryFn: ({ pageParam }) => fetchWorksPage(filters, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === DISCOVER_BATCH ? pages.length : undefined,
    staleTime: 1000 * 60 * 10,
  })
}
