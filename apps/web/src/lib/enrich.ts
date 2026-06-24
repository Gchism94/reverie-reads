import { supabase } from './supabase'

export interface EnrichResult {
  title: string
  author: string
  cover: string
  isbn: string
  pubYear: number | null
  source: string | null
}

/**
 * Ask the enrichment Edge Function for a cover + metadata (Google Books → Open Library →
 * Hardcover). Returns null on any failure so callers degrade gracefully.
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
