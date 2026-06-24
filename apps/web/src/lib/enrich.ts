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
  try {
    const { data, error } = await supabase.functions.invoke('enrich', { body: input })
    if (error || !data) return null
    return data as EnrichResult
  } catch {
    return null
  }
}
