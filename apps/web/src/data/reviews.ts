import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { norm, type Book } from '@reverie/core'
import { supabase } from '../lib/supabase'

/** Shared identity for a book across users — reviews attach to this, not a per-user row id. */
export function workKeyFor(book: Pick<Book, 'isbn' | 'title' | 'last'>): string {
  const isbn = (book.isbn || '').replace(/[^0-9Xx]/g, '')
  return isbn.length >= 10 ? `isbn:${isbn}` : `${norm(book.title)}|${norm(book.last)}`
}

export interface ReviewRecord {
  id: string
  reviewerId: string
  reviewerName: string
  rating: number
  body: string
  date: string
}

export const reviewsKey = (workKey: string) => ['reviews', workKey] as const

/** Individual reviews for a work — listed as distinct voices, never averaged. Opt-in via `enabled`. */
export function useReviews(workKey: string, enabled: boolean) {
  return useQuery({
    queryKey: reviewsKey(workKey),
    queryFn: async (): Promise<ReviewRecord[]> => {
      const { data, error } = await supabase
        .from('reviews')
        .select('id, reviewer_id, reviewer_name, rating, body, created_at')
        .eq('work_key', workKey)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (
        data as { id: string; reviewer_id: string; reviewer_name: string | null; rating: number | null; body: string; created_at: string }[]
      ).map((r) => ({
        id: r.id,
        reviewerId: r.reviewer_id,
        reviewerName: r.reviewer_name ?? 'Reader',
        rating: r.rating ?? 0,
        body: r.body,
        date: r.created_at,
      }))
    },
    enabled: enabled && !!workKey,
  })
}

/** Create or update the signed-in user's own review for a work. */
export function useUpsertReview(workKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ rating, body, reviewerName }: { rating: number; body: string; reviewerName: string }) => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) throw new Error('Not signed in')
      const { error } = await supabase
        .from('reviews')
        .upsert(
          { work_key: workKey, reviewer_id: uid, reviewer_name: reviewerName, rating, body },
          { onConflict: 'work_key,reviewer_id' },
        )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewsKey(workKey) }),
  })
}
