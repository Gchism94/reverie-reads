import { useQuery } from '@tanstack/react-query'
import { enrichBook, type CoverAlternate } from '../lib/enrich'

/**
 * Fetch a book's alternate edition covers on demand (the E1 alternates). Served from the global
 * enrichment cache, so a hit is instant with zero external calls — which is why we DON'T persist
 * alternates on every book row. Only runs when `enabled` (i.e. the picker is open).
 */
export function useCoverAlternates(
  book: { id: string; title?: string; first?: string; last?: string },
  enabled: boolean,
) {
  const author = [book.first, book.last].filter(Boolean).join(' ')
  return useQuery<CoverAlternate[]>({
    queryKey: ['coverAlternates', book.id],
    queryFn: async () => {
      const r = await enrichBook({ title: book.title, author })
      return r?.alternates ?? []
    },
    enabled: enabled && !!book.title,
    staleTime: 5 * 60 * 1000,
  })
}
