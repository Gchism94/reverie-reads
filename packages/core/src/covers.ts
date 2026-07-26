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

/**
 * INGEST POSTURE (docs/reverie-metadata-sourcing.md §Covers).
 *
 * Google Books' terms prohibit permanent copies and caching beyond the cache header, so a
 * Google-derived image may be HOTLINKED at display size but must never be ingested into our
 * Storage. Everything below is the single place that rule is expressed; the client gates and the
 * ingest Edge Function both read it, so the two can't drift.
 *
 * Ingestible today:
 *   · openlibrary — the most defensible external source (CC0 record; see the doc's residual-risk note)
 *   · upload / camera — unambiguously the reader's own copy, in their own scoped path
 *   · url — a link the reader deliberately pasted, subject to the HOST check below
 *   · hardcover — unchanged by this pass; the doc flags its license as asserted rather than granted,
 *     but that is a separate decision (remediation item 4), not this one's to make silently.
 */
export const INGESTIBLE_COVER_SOURCES: readonly CoverSource[] = ['openlibrary', 'upload', 'camera', 'url', 'hardcover']

/** Display-time only: hotlink at display size, never fetched into Storage. */
export const DISPLAY_ONLY_COVER_SOURCES: readonly CoverSource[] = ['google']

export const isIngestibleCoverSource = (s: CoverSource): boolean =>
  (INGESTIBLE_COVER_SOURCES as readonly string[]).includes(s)

/**
 * Whether these bytes may be stored, judged by HOST rather than by the declared source alone.
 * The declared source is not sufficient: the lazy backfill migrates pre-existing cover URLs under
 * the source label 'url', and a Google thumbnail wearing that label would be persisted just the
 * same. The host is the fact that matters.
 */
export function isIngestibleCoverUrl(url: string): boolean {
  if (!url) return false
  if (isStoredCoverUrl(url)) return false // already ours; nothing to fetch
  return !isGoogleContentCover(url)
}

/** Both gates at once — what every ingest entry point should ask before calling the pipeline. */
export const mayIngestCover = (source: CoverSource, url?: string): boolean =>
  isIngestibleCoverSource(source) && (!url || isIngestibleCoverUrl(url))

/** True when the URL already points at the app's own cover Storage (durable, never a hotlink). */
export const isStoredCoverUrl = (url: string): boolean => url.includes('/storage/v1/object/public/covers/')

/** The Google Books `books/content` endpoint (its imageLinks host + the googleusercontent mirror) —
 *  the only cover host whose `zoom` we rewrite, and the one that serves a stock "no image" plate. */
const GOOGLE_CONTENT_RE = /(?:books\.google\.[a-z.]+|googleusercontent\.com)\/books\/content/i
export const isGoogleContentCover = (url: string): boolean => GOOGLE_CONTENT_RE.test(url)

/**
 * Google Books answers a missing cover with a generic "image not available" plate served at **HTTP 200**
 * — not a 404 — so an `<img>` "loads" it and `onError` never fires. It's a fixed-size asset, byte-stable
 * across book ids: 575×750 (zoom=0/2/3) and 128×170 (zoom=1). A cross-origin `<img>` can't hash the
 * bytes (canvas taint), but `naturalWidth/naturalHeight` are always readable, and that size is signal
 * enough. Used at load time to route the plate to OUR honest placeholder instead of rendering it as a
 * cover. A false positive only costs a slightly smaller REAL cover (we fall back to the un-upgraded
 * original), never a broken state — so an exact-size match is deliberately the tightest rule.
 */
const GOOGLE_NO_COVER_DIMS: ReadonlyArray<readonly [number, number]> = [
  [575, 750], // zoom=0 / zoom=2 / zoom=3 — the large plate (what our upgrades request)
  [128, 170], // zoom=1 — the small plate (the un-upgraded original for a truly cover-less book)
]
export function isGoogleNoCoverArt(url: string, naturalWidth: number, naturalHeight: number): boolean {
  return isGoogleContentCover(url) && GOOGLE_NO_COVER_DIMS.some(([w, h]) => naturalWidth === w && naturalHeight === h)
}

/**
 * Upgrade an external cover URL to the resolution the surface needs. The sources default to tiny
 * images — Google Books' `imageLinks.thumbnail` is `zoom=1` (~128px) and Open Library defaults to
 * `-M` — which pixelate the moment a cover is shown larger than a grid cell. This rewrites the size
 * knob each source exposes:
 *   · Google Books `books/content` — `zoom=0` for the largest scan available (575–1744px, varies by
 *     title), `zoom=2` (~300px) for a light grid thumb; the page-curl artifact is stripped.
 *   · Open Library `covers.openlibrary.org/b/id/…` — `-L` (large) for full, `-M` for a thumb.
 * Storage URLs (already normalised) and any other host (Hardcover, B&N — already full-res) pass
 * through untouched. Idempotent: re-upgrading a URL that already carries the target size is a no-op.
 * `size:'full'` = detail/flip (largest), `'thumb'` = grid (lighter). Pure — shared client + edge.
 */
export function upgradeCoverUrl(url: string, size: 'full' | 'thumb' = 'full'): string {
  if (!url || isStoredCoverUrl(url)) return url

  // Google Books content endpoint (the imageLinks.thumbnail host, and its googleusercontent mirror).
  if (isGoogleContentCover(url)) {
    let u = url.replace(/([?&])edge=curl(&|$)/i, (_m, p1: string, p2: string) => (p2 === '&' ? p1 : '')).replace(/[?&]$/, '')
    const zoom = size === 'thumb' ? '2' : '0'
    u = /[?&]zoom=\d+/i.test(u) ? u.replace(/([?&]zoom=)\d+/i, `$1${zoom}`) : `${u}${u.includes('?') ? '&' : '?'}zoom=${zoom}`
    return u
  }

  // Open Library cover ids carry a trailing size suffix: -S (small) · -M (medium) · -L (large).
  const ol = /^(https?:\/\/covers\.openlibrary\.org\/b\/id\/\d+)-[SML](\.\w+)$/i.exec(url)
  if (ol) return `${ol[1]}-${size === 'thumb' ? 'M' : 'L'}${ol[2]}`

  return url
}

/** True when a cover URL is an external source we can request at a higher resolution (Google/OL).
 *  Used by the re-sharpen sweep to skip Hardcover/B&N/storage covers (already full-res or opaque). */
export const isUpgradeableCoverUrl = (url: string): boolean => !!url && upgradeCoverUrl(url, 'full') !== url

/**
 * The ordered, de-duplicated URLs to try for a book's cover, most-wanted first — the single fallback
 * chain both the grid/detail `<img>` and the Discover card render. The upgraded (larger) URL leads,
 * but the **un-upgraded original is always kept as a fallback**: an upgrade that 404s or returns the
 * source's "no image" plate (see `isGoogleNoCoverArt`) must degrade to the real, smaller cover — never
 * to a broken/placeholder state for a book that has a cover. A stored ~300px thumb (when present, thumb
 * surfaces only) leads since it's already the right size. When every candidate fails, the caller shows
 * the honest skin placeholder. Pure — one implementation, every surface.
 */
export function coverCandidates(
  cover: string | null | undefined,
  opts: { size?: 'full' | 'thumb'; storedThumb?: string | null } = {},
): string[] {
  const { size = 'full', storedThumb } = opts
  const out: string[] = []
  const push = (u?: string | null): void => {
    if (u && !out.includes(u)) out.push(u)
  }
  if (size === 'thumb') push(storedThumb) // already the right size — no upgrade round-trip
  if (cover) {
    push(upgradeCoverUrl(cover, size)) // sharp when the larger scan exists
    push(cover) // the real cover at its native (smaller) size — the honest fallback
  }
  return out
}

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
 * Resolve a cover URL for INGEST. Open Library only.
 *
 * The prototype's order was Google first, Open Library second, and this fed a pipeline that stores
 * what it resolves — so the preferred source was the one whose terms forbid storing. Open Library is
 * now the source, and a miss returns empty rather than falling back to Google: whatever this returns
 * gets persisted, and a Google URL must never be. An empty result is the honest placeholder's cue.
 *
 * Google remains available at DISPLAY time (search results, edition candidates, hotlinked
 * thumbnails) — see `coverCandidates`, which is untouched. This function is about bytes we keep.
 */
export async function fetchCover(b: CoverLookup, fetchImpl: FetchLike): Promise<string> {
  try {
    const res = await fetchImpl(buildOpenLibraryUrl(b))
    const url = extractOpenLibraryCover((await res.json()) as OpenLibraryResponse)
    return isIngestibleCoverUrl(url) ? url : ''
  } catch {
    return ''
  }
}
