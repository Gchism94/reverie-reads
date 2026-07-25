import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Tier 2 client seam (owner-approved): nearest-neighbour reads over book_embeddings, plus the
// fire-and-forget sweep that keeps vectors fresh. Embeddings are an ENHANCEMENT — every consumer
// treats absence (fn not deployed, backfill mid-flight, offline) as "no section", never an error.

export interface SimilarHit {
  book_id: string
  similarity: number
}

export const similarKey = (bookId: string) => ['similar', bookId] as const

/** Nearest library neighbours of a book (pure SQL — works even with the edge fn down). */
export function useSimilarBooks(bookId: string, count = 8) {
  return useQuery({
    queryKey: similarKey(bookId),
    queryFn: async (): Promise<SimilarHit[]> => {
      const { data, error } = await supabase.rpc('similar_books', { p_book_id: bookId, p_count: count })
      if (error) throw error
      return (data ?? []) as SimilarHit[]
    },
    enabled: !!bookId,
    staleTime: 1000 * 60 * 10,
    retry: 0, // absence is a fine answer — don't hammer while the backfill runs
  })
}

let sweptThisSession = false

/** Fire-and-forget backfill: embed missing/stale books (sig-gated server-side), many SMALL calls
 *  (the fn stays under the edge CPU budget per request), once per session. New vectors invalidate
 *  the similar queries so sections fill in as the backfill lands. */
export function useEnsureEmbeddings() {
  const qc = useQueryClient()
  useEffect(() => {
    if (sweptThisSession) return
    sweptThisSession = true
    void (async () => {
      try {
        for (let i = 0; i < 30; i++) {
          const { data, error } = await supabase.functions.invoke('embed', { body: { mode: 'sweep' } })
          if (error) return
          const d = data as { embedded?: number; remaining?: number }
          if (d?.embedded) await qc.invalidateQueries({ queryKey: ['similar'] })
          if (!d?.remaining) return
        }
      } catch {
        /* enhancement only — the app never blocks on embeddings */
      }
    })()
  }, [qc])
}

/** Free-text vibe search over the reader's own library (embedded server-side, same model). */
export function useVibeSearch() {
  return useMutation({
    meta: { action: 'Similar books' },
    mutationFn: async (query: string): Promise<SimilarHit[]> => {
      const { data, error } = await supabase.functions.invoke('embed', { body: { mode: 'vibe', query, count: 12 } })
      if (error) throw error
      return ((data as { hits?: SimilarHit[] })?.hits ?? []).filter((h) => h && typeof h.book_id === 'string')
    },
  })
}
