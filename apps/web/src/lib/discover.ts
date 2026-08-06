import {
  blendCuratedPool,
  embeddingText,
  genreKey,
  tierDiscoverShelf,
  type Book,
} from '@reverie/core'
import { volumesUrl } from './googleBooks'
import { supabase } from './supabase'

// Discover v1 (owner-approved): a genre-keyed browse of the wider catalog, one tap from Add.
// Client-side Google Books, the same source and pattern as the Add screen's search — each reader
// spends their own anonymous quota, and TanStack Query's staleTime keeps a session to a handful of
// calls. The upgrade path (deliberately out of v1): a `discover` edge function with a shared
// per-genre daily cache + Hardcover trending, and Tier-2 embeddings re-ranking these results
// toward the reader's taste. This module stays pure/fetch-thin so that swap is a one-liner.

/** Same shape as the Add screen's search hits — a Discover pick IS an add prefill. */
export interface DiscoverHit {
  title: string
  authors: string[]
  cover: string
  isbn: string
  pub: string
  /** provenance: true only on curated-injection hits (packages/core discoverCurated) — debuggable
   *  in the network tab and the fn's cache rows, never rendered to the reader */
  curated?: boolean
}

/** Google Books subject query per core genre (keys = the canonical lowercased genres). Cozy has no
 *  BISAC top of its own — its room browses the cozy-mystery shelf; nonfiction leads with the
 *  biography/memoir bucket (the largest general-reader nonfiction shelf). */
export const GENRE_DISCOVER_QUERY: Record<string, string> = {
  romance: 'subject:romance',
  fantasy: 'subject:fantasy',
  'science fiction': 'subject:"science fiction"',
  horror: 'subject:horror',
  mystery: 'subject:mystery',
  literary: 'subject:"literary fiction"',
  cozy: 'subject:"cozy mysteries"',
  nonfiction: 'subject:"biography & autobiography"',
  'young adult': 'subject:"young adult fiction"',
}

/** The subject query for any genre spelling (resolved via genreKey); an unknown genre browses
 *  its own name as a subject — a reader's custom world is still browsable. */
export function discoverQuery(genre: string): string {
  const key = genreKey(genre)
  return GENRE_DISCOVER_QUERY[key] ?? `subject:"${key}"`
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Map a raw Google volume to a hit (https-forced cover, canonical ISBN-13 preferred). */
export function volumeToHit(item: any): DiscoverHit {
  const v = item?.volumeInfo ?? {}
  const ids: any[] = v.industryIdentifiers ?? []
  const ind = ids.find((x) => x.type === 'ISBN_13') ?? ids[0]
  return {
    title: v.title ?? '',
    authors: v.authors ?? [],
    cover: String(v.imageLinks?.thumbnail ?? '')
      .replace('http:', 'https:')
      .replace('&edge=curl', ''),
    isbn: ind?.identifier ?? '',
    pub: v.publishedDate ?? '',
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
const isbnKey = (isbn: string): string => isbn.replace(/[^0-9Xx]/g, '').toLowerCase()

/** Identity for dedupe/ownership: ISBN when present, else normalized title + first author. */
export function hitKey(h: { title: string; authors?: string[]; isbn?: string }): string {
  const isbn = isbnKey(h.isbn ?? '')
  return isbn || `${norm(h.title)}|${norm(h.authors?.[0] ?? '')}`
}

export function dedupeHits(hits: DiscoverHit[]): DiscoverHit[] {
  const seen = new Set<string>()
  const out: DiscoverHit[] = []
  for (const h of hits) {
    const byIsbn = isbnKey(h.isbn)
    const byTitle = `${norm(h.title)}|${norm(h.authors[0] ?? '')}`
    if ((byIsbn && seen.has(byIsbn)) || seen.has(byTitle)) continue
    if (byIsbn) seen.add(byIsbn)
    seen.add(byTitle)
    out.push(h)
  }
  return out
}

/** Which hits the reader already shelves — matched by ISBN or by title + first contributor. */
export function ownedKeys(books: readonly Book[]): Set<string> {
  const keys = new Set<string>()
  for (const b of books) {
    const isbn = isbnKey(b.isbn ?? '')
    if (isbn) keys.add(isbn)
    keys.add(`${norm(b.title)}|${norm(b.contributors[0]?.name ?? '')}`)
  }
  return keys
}

export function isOwned(h: DiscoverHit, owned: Set<string>): boolean {
  const isbn = isbnKey(h.isbn)
  if (isbn && owned.has(isbn)) return true
  return owned.has(`${norm(h.title)}|${norm(h.authors[0] ?? '')}`)
}

async function fetchPage(
  query: string,
  orderBy: 'newest' | 'relevance',
  signal?: AbortSignal,
): Promise<DiscoverHit[]> {
  const url = volumesUrl(
    `q=${encodeURIComponent(query)}&orderBy=${orderBy}&printType=books&langRestrict=en&maxResults=20`,
  )
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`discover ${res.status}`)
  const json = (await res.json()) as { items?: unknown[] }
  // a browsable hit needs a face and a byline — skip catalog rows without them
  return (json.items ?? []).map(volumeToHit).filter((h) => h.title && h.cover && h.authors.length)
}

/** The Discover shelf for a genre. Primary path: the releases fn's shared per-genre daily cache
 *  (one upstream lookup serves every reader, recency-gated server-side — no 1927 reprints on a
 *  "new & notable" shelf). Fallback: the original direct client fetch, so Discover still works
 *  with the fn undeployed or down. */
export async function fetchDiscover(genre: string, signal?: AbortSignal): Promise<DiscoverHit[]> {
  const query = discoverQuery(genre)
  try {
    const { data, error } = await supabase.functions.invoke('releases', {
      body: { mode: 'discover', genre: genreKey(genre), query },
    })
    if (!error) {
      const hits = ((data as { hits?: DiscoverHit[] })?.hits ?? []).filter(
        (h) => h?.title && h.cover && h.authors?.length,
      )
      if (hits.length) return hits
    }
  } catch {
    /* fall through to the direct path */
  }
  const newest = await fetchPage(query, 'newest', signal)
  let hits = newest
  if (hits.length < 9) {
    const filler = await fetchPage(query, 'relevance', signal)
    hits = [...hits, ...filler]
  }
  // Curated injection for the four starved categories, mirroring the fn path: blend into the pool,
  // then rank the union by the fn's own year-tier logic so curated and live sort by ONE function.
  // For every other genre blendCuratedPool is a passthrough and this path is byte-identical to
  // before — the fallback's no-tiering behavior there is pre-existing, not this feature's to change.
  const deduped = dedupeHits(hits)
  const pool = blendCuratedPool(genreKey(genre), deduped) as DiscoverHit[]
  if (pool.length > deduped.length && import.meta.env.DEV)
    console.debug(
      `[discover] ${genre}: injected ${pool.length - deduped.length} curated (fallback path)`,
    )
  const ranked = pool === deduped ? pool : tierDiscoverShelf(pool, new Date().getFullYear())
  return ranked.slice(0, 12)
}

// ── Tier 2b: taste ranking (owner-approved) ──
// External finds scored against the reader's taste centroid (mean vector of loved books) by the
// embed fn's rank mode. Absence of taste (cold start, fn down, budget cut) is a fine answer —
// callers pass through to catalog order.

/** hitKey → cosine-to-centroid. The fn scores as many items as fit its per-request CPU budget
 *  (all of them on hosted; a few per call on slower runtimes), so we accumulate across a handful
 *  of calls until every hit is scored or a call stops making progress. */
export async function rankHitsByTaste(
  hits: DiscoverHit[],
  genre: string,
): Promise<Record<string, number> | null> {
  try {
    let remaining = hits.slice(0, 16).map((h) => ({
      key: hitKey(h),
      // same composition the library vectors use (title + author + world) — one semantic space
      text: embeddingText({ title: h.title, author: h.authors[0], genre }),
    }))
    const scores: Record<string, number> = {}
    for (let call = 0; call < 6 && remaining.length; call++) {
      const { data, error } = await supabase.functions.invoke('embed', {
        body: { mode: 'rank', items: remaining },
      })
      if (error) break
      const d = data as { hasTaste?: boolean; scores?: { key: string; score: number }[] }
      if (!d?.hasTaste || !d.scores?.length) break
      for (const s of d.scores) scores[s.key] = s.score
      remaining = remaining.filter((it) => scores[it.key] == null)
    }
    return Object.keys(scores).length ? scores : null
  } catch {
    return null
  }
}

/** Taste-scored hits first (closest first); unscored hits keep their catalog order behind them. */
export function sortByTaste(
  hits: readonly DiscoverHit[],
  scores: Record<string, number>,
): { hit: DiscoverHit; taste?: number }[] {
  const annotated = hits.map((hit) => {
    const taste = scores[hitKey(hit)]
    return taste == null ? { hit } : { hit, taste }
  })
  const scored = annotated
    .filter((a) => a.taste != null)
    .sort((a, b) => (b.taste ?? 0) - (a.taste ?? 0))
  const unscored = annotated.filter((a) => a.taste == null)
  return [...scored, ...unscored]
}
