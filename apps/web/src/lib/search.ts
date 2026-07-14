import { matchBook, type Book, type Incoming } from '@reverie/core'
import { supabase } from './supabase'
import { volumesUrl } from './googleBooks'

// One search implementation, two surfaces (Discover field + the shelf picker's "search everywhere").
// Primary path: the `search` edge function — Hardcover (backend-only) + Google fill, server-cached,
// rate-limited. Fallback path: client-side Google Books via the referrer-restricted key, so search
// still works with the function undeployed or down. This fallback IS the documented Google key seam
// (task §1): Hardcover is only reachable through the backend; Google has a client key too.

/** A search hit — cover/title/author/year/series (task §1). No consensus fields (anti-consensus). */
export interface SearchResult {
  source: 'hardcover' | 'google'
  title: string
  authors: string[]
  cover: string
  isbn: string
  isbn13?: string
  isbn10?: string
  year: string
  series?: string
  seriesPosition?: number | null
}

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const isbnKey = (isbn: string): string => (isbn || '').replace(/[^0-9Xx]/g, '').toLowerCase()

/** Identity for dedupe: ISBN-13 (or any ISBN) when present, else normalized title + first author. */
export const resultKey = (r: SearchResult): string =>
  isbnKey(r.isbn13 ?? r.isbn) || `${norm(r.title)}|${norm(r.authors[0] ?? '')}`

export function dedupeResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>()
  const out: SearchResult[] = []
  for (const r of results) {
    const k = resultKey(r)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

/** A search result as an Incoming (for matchBook / intake). */
export function resultToIncoming(r: SearchResult): Incoming {
  const [first = '', ...rest] = (r.authors[0] ?? '').split(/\s+/)
  return {
    title: r.title,
    first,
    last: rest.join(' '),
    isbn: r.isbn13 ?? r.isbn ?? '',
    series: r.series,
    position: r.seriesPosition ?? '',
  }
}

/** The library book a result already IS, or null — reuses core's ISBN/title-author matcher, so the
 *  result shows its shelf state (and links to it) instead of add actions (task §1). */
export function libraryMatch(r: SearchResult, library: readonly Book[]): Book | null {
  const m = matchBook(resultToIncoming(r), library)
  return m.strength === 'none' ? null : m.book
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Client-side Google Books mapping — the fallback leg (referrer-restricted key via volumesUrl). */
function volumeToResult(item: any): SearchResult | null {
  const v = item?.volumeInfo ?? {}
  if (!v.title) return null
  const cover = String(v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail ?? '')
    .replace('http:', 'https:')
    .replace('&edge=curl', '')
  if (!cover) return null
  const ids: any[] = v.industryIdentifiers ?? []
  const isbn13 = ids.find((x) => x.type === 'ISBN_13')?.identifier
  const isbn10 = ids.find((x) => x.type === 'ISBN_10')?.identifier
  const year = typeof v.publishedDate === 'string' ? v.publishedDate.slice(0, 4) : ''
  return {
    source: 'google',
    title: v.title,
    authors: (v.authors ?? []).filter(Boolean),
    cover,
    isbn: isbn13 ?? isbn10 ?? '',
    isbn13,
    isbn10,
    year: /^\d{4}$/.test(year) ? year : '',
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function googleFallback(q: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const isbnQ = q.replace(/[^0-9Xx]/g, '')
  const looksIsbn = isbnQ.length >= 10 && /^[0-9Xx\- ]+$/.test(q)
  const query = looksIsbn ? `isbn:${isbnQ}` : encodeURIComponent(q)
  const res = await fetch(volumesUrl(`q=${query}&maxResults=20&printType=books&langRestrict=en`), { signal })
  if (!res.ok) return []
  const json = (await res.json()) as { items?: unknown[] }
  return (json.items ?? []).map(volumeToResult).filter((r): r is SearchResult => r !== null)
}

/**
 * Search the wider catalog for a query (title / author / ISBN). Backend first (Hardcover + Google,
 * cached); on any failure or an empty backend answer, the client Google leg fills in so search is
 * never dead. Returns deduped results.
 */
export async function searchEverywhere(q: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const query = q.trim()
  if (query.length < 3) return []
  try {
    const { data, error } = await supabase.functions.invoke('search', { body: { q: query } })
    if (!error) {
      const results = ((data as { results?: SearchResult[] })?.results ?? []).filter((r) => r?.title && r.cover)
      if (results.length) return dedupeResults(results)
    }
  } catch {
    /* fall through to the client Google leg */
  }
  return dedupeResults(await googleFallback(query, signal))
}
