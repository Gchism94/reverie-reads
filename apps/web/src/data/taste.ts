import { useQuery } from '@tanstack/react-query'
import type { TasteAnchors } from '@reverie/core'
import { supabase } from '../lib/supabase'

// Taste display calibration client seam (taste-tiers). The reader's two fixed anchors + per-book
// taste scores come from the RPCs added in the taste_calibration migration. Both are an ENHANCEMENT:
// absence (cold start, fn/RPC down, offline) means "show no tier", never an error — the same
// pass-through discipline the rest of the Tier-2 surface uses.

/** The reader's calibration anchors (lo/hi), recomputed live server-side from their current rows —
 *  so it tracks the taste vector as the library evolves. null = cold start (no loved+embedded books). */
export function useTasteCalibration() {
  return useQuery({
    queryKey: ['taste-calibration'],
    queryFn: async (): Promise<TasteAnchors | null> => {
      const { data, error } = await supabase.rpc('taste_calibration')
      if (error) throw error
      const row = (data ?? [])[0] as { lo: number; hi: number } | undefined
      return row && typeof row.lo === 'number' && typeof row.hi === 'number' ? { lo: row.lo, hi: row.hi } : null
    },
    staleTime: 1000 * 60 * 10,
    retry: 0, // absence is a fine answer
  })
}

/** Per-book taste (cosine-to-centroid) for a set of the reader's OWN books — lets More-like-this show
 *  the same tier a book would show in Discover. Keyed on the id set so it refetches as the list changes. */
export function useTasteScores(bookIds: readonly string[]) {
  const ids = [...bookIds].sort()
  return useQuery({
    queryKey: ['taste-scores', ids],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.rpc('taste_scores', { p_book_ids: ids })
      if (error) throw error
      const out: Record<string, number> = {}
      for (const r of (data ?? []) as { book_id: string; taste: number }[]) out[r.book_id] = r.taste
      return out
    },
    enabled: ids.length > 0,
    staleTime: 1000 * 60 * 10,
    retry: 0,
  })
}
