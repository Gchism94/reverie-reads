import { supabase } from './supabase'

/** Per-field provenance from the aggregator (which source supplied each field, and when). */
export interface FieldProvenance {
  source: 'openlibrary' | 'google' | 'hardcover' | 'isbndb' | 'manual'
  at: string
}

/** How sure the title+author resolution is (E1); an exact-ISBN scan is always 'high'. */
export type EnrichConfidence = 'high' | 'medium' | 'low' | 'none'

/** An alternate edition candidate for the Cover Studio picker (E1 alternates). */
export interface CoverAlternate {
  source: 'openlibrary' | 'google' | 'hardcover' | 'isbndb' | 'manual'
  cover: string
  isbn13: string
  title: string
  author: string
}

/** Full normalized record returned by the enrichment aggregator (docs/ENRICHMENT_STRATEGY.md). */
export interface EnrichResult {
  title: string
  authors: string[]
  author: string
  series: string
  seriesPosition: number | null
  publisher: string
  pubY: number | null
  pubM: number | null
  pubD: number | null
  pageCount: number | null
  binding?: string
  isbn10: string
  isbn13: string
  isbn: string
  /** every edition ISBN the sources knew (union) */
  isbns?: string[]
  language: string
  /** primary genre mapped from categories (the C1 genre-fill) */
  genre?: string
  genres: string[]
  description: string
  cover: string
  workId?: string
  editionId?: string
  provenance?: Record<string, FieldProvenance>
  source: string | null
  /** E1: confidence of the title+author match (drives the import-review "needs a look" buckets) */
  confidence?: EnrichConfidence
  /** E1: the normalized title+author query the search used */
  query?: string
  /** E1: alternate edition candidates for the Cover Studio picker */
  alternates?: CoverAlternate[]
}

/** Ordered per-stage wall times from the Edge Function, present only when `trace` was requested. */
export interface ServerTrace {
  spans: { s: string; ms: number }[]
  totalMs: number
}

export type EnrichOutcome =
  | { status: 'ok'; data: EnrichResult; trace?: ServerTrace }
  | { status: 'empty'; trace?: ServerTrace }
  | { status: 'rate_limited' }

/**
 * Ask the enrichment Edge Function for a record, surfacing whether the upstream sources were
 * rate-limited (so a bulk run can pause and resume rather than burning the book's retry window).
 */
export async function enrichBookOutcome(input: {
  title?: string
  author?: string
  isbn?: string
  /** 'fast' = one source by ISBN for an instant record; 'full' (default) = the multi-source merge. */
  mode?: 'fast' | 'full'
  /** Ask the function to return its per-stage timings. Off by default; the response is unchanged. */
  trace?: boolean
  /** Skip the global enrichment_cache and re-query the sources. Measurement runs only. */
  refresh?: boolean
}): Promise<EnrichOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke('enrich', { body: input })
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status
      return status === 429 ? { status: 'rate_limited' } : { status: 'empty' }
    }
    const trace = (data as { _trace?: ServerTrace })?._trace
    if (!data) return { status: 'empty' }
    if ((data as { rateLimited?: boolean }).rateLimited) return { status: 'rate_limited' }
    return { status: 'ok', data: data as EnrichResult, trace }
  } catch {
    return { status: 'empty' }
  }
}

/**
 * Ask the enrichment Edge Function for a full record (Google Books → Open Library →
 * Hardcover, cached). Returns null on any failure so callers degrade gracefully — an
 * ASIN-only/no-cover title still returns a (sparse) record rather than throwing.
 */
export async function enrichBook(input: {
  title?: string
  author?: string
  isbn?: string
  mode?: 'fast' | 'full'
}): Promise<EnrichResult | null> {
  const outcome = await enrichBookOutcome(input)
  return outcome.status === 'ok' ? outcome.data : null
}
