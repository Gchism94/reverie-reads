import { supabase } from './supabase'

/** Per-field provenance from the aggregator (which source supplied each field, and when). */
export interface FieldProvenance {
  source: 'openlibrary' | 'google' | 'hardcover' | 'isbndb' | 'manual'
  at: string
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
}

export type EnrichOutcome =
  | { status: 'ok'; data: EnrichResult }
  | { status: 'empty' }
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
}): Promise<EnrichOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke('enrich', { body: input })
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status
      return status === 429 ? { status: 'rate_limited' } : { status: 'empty' }
    }
    if (!data) return { status: 'empty' }
    if ((data as { rateLimited?: boolean }).rateLimited) return { status: 'rate_limited' }
    return { status: 'ok', data: data as EnrichResult }
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
