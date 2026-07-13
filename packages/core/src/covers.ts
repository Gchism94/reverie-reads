import { norm } from './normalize'

export interface CoverLookup {
  title: string
  last?: string
}

/** Cache/match key for a cover — normalized title|author. */
export const coverKey = (b: CoverLookup): string => norm(b.title) + '|' + norm(b.last)

/** Google Books query URL (exact title, optional author) — the prototype's primary source. */
export function buildGoogleBooksUrl(b: CoverLookup): string {
  let q = `intitle:${encodeURIComponent('"' + b.title + '"')}`
  if (b.last) q += `+inauthor:${encodeURIComponent('"' + b.last + '"')}`
  return `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`
}

/** Open Library search URL — the prototype's fallback source. */
export function buildOpenLibraryUrl(b: CoverLookup): string {
  return `https://openlibrary.org/search.json?title=${encodeURIComponent(
    b.title,
  )}&author=${encodeURIComponent(b.last ?? '')}&limit=1`
}

interface GoogleBooksResponse {
  items?: { volumeInfo?: { imageLinks?: { thumbnail?: string; smallThumbnail?: string } } }[]
}

interface OpenLibraryResponse {
  docs?: { cover_i?: number }[]
}

// Force https and drop Google's page-curl artifact (verbatim from the prototype).
const tidy = (url: string): string => url.replace('http:', 'https:').replace('&edge=curl', '')

export function extractGoogleCover(json: GoogleBooksResponse): string {
  const links = json.items?.[0]?.volumeInfo?.imageLinks
  const link = links?.thumbnail ?? links?.smallThumbnail ?? ''
  return link ? tidy(link) : ''
}

export function extractOpenLibraryCover(json: OpenLibraryResponse): string {
  const id = json.docs?.[0]?.cover_i
  return id ? `https://covers.openlibrary.org/b/id/${id}-M.jpg` : ''
}

// ── Cover system (the cover is the door) ──

/** Where a book's current cover came from — provenance persisted alongside the stored asset. */
export type CoverSource = 'hardcover' | 'google' | 'openlibrary' | 'upload' | 'camera' | 'url'

export const COVER_SOURCES: readonly CoverSource[] = ['hardcover', 'google', 'openlibrary', 'upload', 'camera', 'url']

export const isCoverSource = (s: unknown): s is CoverSource =>
  typeof s === 'string' && (COVER_SOURCES as readonly string[]).includes(s)

/** True when the URL already points at the app's own cover Storage (durable, never a hotlink). */
export const isStoredCoverUrl = (url: string): boolean => url.includes('/storage/v1/object/public/covers/')

/**
 * The enrichment chain's cover offer, gated by the non-overwrite rule: a USER-CHOSEN cover is never
 * replaced (same principle as series data) — enrichment fills only where no user choice exists.
 * mergeImport is already fill-only for non-empty covers; this guard additionally keeps enrichment
 * from re-offering a cover for a book whose cover the reader deliberately set (or later cleared).
 */
export function enrichmentCoverFill(book: { cover: string; coverUserChosen?: boolean }, offered: string): string {
  if (book.coverUserChosen) return ''
  if (book.cover) return '' // fill-only — an existing cover (user, seed, or prior fill) stays
  return offered
}

type FetchLike = (url: string) => Promise<{ json: () => Promise<unknown> }>

/**
 * Resolve a cover URL: Google Books first, then Open Library — the prototype's fallback
 * order. The fetch implementation is injected so core stays runtime-agnostic and testable.
 */
export async function fetchCover(b: CoverLookup, fetchImpl: FetchLike): Promise<string> {
  try {
    const res = await fetchImpl(buildGoogleBooksUrl(b))
    const url = extractGoogleCover((await res.json()) as GoogleBooksResponse)
    if (url) return url
  } catch {
    /* fall through to Open Library */
  }
  try {
    const res = await fetchImpl(buildOpenLibraryUrl(b))
    return extractOpenLibraryCover((await res.json()) as OpenLibraryResponse)
  } catch {
    return ''
  }
}
