import { genreKey, type Book } from '@reverie/core'

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
    cover: String(v.imageLinks?.thumbnail ?? '').replace('http:', 'https:').replace('&edge=curl', ''),
    isbn: ind?.identifier ?? '',
    pub: v.publishedDate ?? '',
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
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

const API = 'https://www.googleapis.com/books/v1/volumes'

async function fetchPage(query: string, orderBy: 'newest' | 'relevance', signal?: AbortSignal): Promise<DiscoverHit[]> {
  const url = `${API}?q=${encodeURIComponent(query)}&orderBy=${orderBy}&printType=books&langRestrict=en&maxResults=20`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`discover ${res.status}`)
  const json = (await res.json()) as { items?: unknown[] }
  // a browsable hit needs a face and a byline — skip catalog rows without them
  return (json.items ?? []).map(volumeToHit).filter((h) => h.title && h.cover && h.authors.length)
}

/** The Discover shelf for a genre: newest first, topped up with relevance picks when the new
 *  releases run thin (newest-by-subject is patchy for smaller genres). */
export async function fetchDiscover(genre: string, signal?: AbortSignal): Promise<DiscoverHit[]> {
  const query = discoverQuery(genre)
  const newest = await fetchPage(query, 'newest', signal)
  let hits = newest
  if (hits.length < 9) {
    const filler = await fetchPage(query, 'relevance', signal)
    hits = [...hits, ...filler]
  }
  return dedupeHits(hits).slice(0, 12)
}
