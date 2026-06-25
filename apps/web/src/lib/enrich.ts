import { supabase } from './supabase'

/** Full normalized record returned by the enrichment Edge Function. */
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
  isbn10: string
  isbn13: string
  isbn: string
  language: string
  genres: string[]
  description: string
  cover: string
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
}): Promise<EnrichResult | null> {
  const outcome = await enrichBookOutcome(input)
  return outcome.status === 'ok' ? outcome.data : null
}
