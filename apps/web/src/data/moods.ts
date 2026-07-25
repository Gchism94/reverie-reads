import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { booksKey } from './books'

/**
 * The mood vocabulary + assignment data layer — a READER-ASSIGNED dimension (docs/task-mood.md).
 * Canonical rows (owner_id null) come from the seed migration; personal rows are RLS-scoped to the
 * reader, optionally alias-linked to a canonical. Assignments (book_moods) ride into Book.moods via
 * the useBooks join — mutations here invalidate booksKey so chips/pages follow.
 *
 * There is NO suggestion hook and NO derivation of any kind here: every assignment is an explicit
 * reader gesture. Moods carry no facet and no emphasis — mood is felt, not weighted or classified.
 */

export interface UiMood {
  id: string
  name: string
  personal: boolean
  canonicalId: string | null
}

interface MoodRowT {
  id: string
  owner_id: string | null
  canonical_id: string | null
  name: string
}

const toUiMood = (r: MoodRowT): UiMood => ({
  id: r.id,
  name: r.name,
  personal: r.owner_id != null,
  canonicalId: r.canonical_id,
})

export const moodsKey = ['moods'] as const
export const bookMoodsKey = ['book-moods', 'all'] as const

/** The whole vocabulary the reader can see: canonical + their personal coinages. */
export function useMoods() {
  return useQuery({
    queryKey: moodsKey,
    queryFn: async (): Promise<UiMood[]> => {
      const { data, error } = await supabase.from('moods').select('id, owner_id, canonical_id, name').order('name')
      if (error) throw error
      return (data as MoodRowT[]).map(toUiMood)
    },
  })
}

export interface BookMoodRow {
  book_id: string
  mood_id: string
}

/** Every assignment — mood pages read carriers/counts from this. */
export function useAllBookMoods() {
  return useQuery({
    queryKey: bookMoodsKey,
    queryFn: async (): Promise<BookMoodRow[]> => {
      const { data, error } = await supabase.from('book_moods').select('book_id, mood_id')
      if (error) throw error
      return (data ?? []) as BookMoodRow[]
    },
  })
}

function useInvalidateMoods() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: booksKey })
    void qc.invalidateQueries({ queryKey: bookMoodsKey })
  }
}

/** Assign a mood to a book. Upsert keeps the tap-to-toggle gesture idempotent. */
export function useAssignMood() {
  const invalidate = useInvalidateMoods()
  return useMutation({
    meta: { action: 'Mood' },
    mutationFn: async (input: { bookId: string; moodId: string }) => {
      const { data: auth } = await supabase.auth.getUser()
      const ownerId = auth.user?.id
      if (!ownerId) throw new Error('Not signed in')
      const { error } = await supabase
        .from('book_moods')
        .upsert({ book_id: input.bookId, mood_id: input.moodId, owner_id: ownerId }, { onConflict: 'book_id,mood_id' })
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })
}

export function useUnassignMood() {
  const invalidate = useInvalidateMoods()
  return useMutation({
    meta: { action: 'Mood' },
    mutationFn: async (input: { bookId: string; moodId: string }) => {
      const { error } = await supabase.from('book_moods').delete().eq('book_id', input.bookId).eq('mood_id', input.moodId)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })
}

/** Create a personal mood. The caller resolves against canon FIRST (resolveMood) so a near-match
 *  offers the canonical instead of duplicating. Owner-scoped, optional canonical alias. */
export function useCreatePersonalMood() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'Mood' },
    mutationFn: async (input: { name: string; canonicalId?: string }): Promise<UiMood> => {
      const { data: auth } = await supabase.auth.getUser()
      const ownerId = auth.user?.id
      if (!ownerId) throw new Error('Not signed in')
      const { data, error } = await supabase
        .from('moods')
        .insert({ owner_id: ownerId, name: input.name, canonical_id: input.canonicalId ?? null })
        .select('id, owner_id, canonical_id, name')
        .single()
      if (error) throw error
      return toUiMood(data as MoodRowT)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: moodsKey }),
  })
}
