import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface DefaultStore {
  id: string
  name: string
  website: string
}

export interface Profile {
  id: string
  displayName: string
  goalYear: number | null
  goalTarget: number | null
  autoMergeDuplicates: boolean
  defaultStore: DefaultStore | null
}

interface ProfileRow {
  id: string
  display_name: string | null
  goal_year: number | null
  goal_target: number | null
  auto_merge_duplicates: boolean | null
  default_store_id: string | null
  default_store_name: string | null
  default_store_website: string | null
}

export const profileKey = ['profile'] as const

const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  displayName: row.display_name ?? '',
  goalYear: row.goal_year,
  goalTarget: row.goal_target,
  autoMergeDuplicates: row.auto_merge_duplicates ?? true,
  defaultStore: row.default_store_id
    ? { id: row.default_store_id, name: row.default_store_name ?? '', website: row.default_store_website ?? '' }
    : null,
})

/** The signed-in user's own profile (RLS returns only their row). */
export function useProfile() {
  return useQuery({
    queryKey: profileKey,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, goal_year, goal_target, auto_merge_duplicates, default_store_id, default_store_name, default_store_website')
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data ? toProfile(data as ProfileRow) : null
    },
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: {
      displayName?: string
      goalYear?: number | null
      goalTarget?: number | null
      autoMergeDuplicates?: boolean
      defaultStore?: DefaultStore | null
    }): Promise<void> => {
      const { data: auth } = await supabase.auth.getUser()
      const id = auth.user?.id
      if (!id) throw new Error('Not signed in')
      const row: Partial<ProfileRow> = {}
      if (patch.displayName !== undefined) row.display_name = patch.displayName
      if (patch.goalYear !== undefined) row.goal_year = patch.goalYear
      if (patch.goalTarget !== undefined) row.goal_target = patch.goalTarget
      if (patch.autoMergeDuplicates !== undefined) row.auto_merge_duplicates = patch.autoMergeDuplicates
      if (patch.defaultStore !== undefined) {
        row.default_store_id = patch.defaultStore?.id ?? null
        row.default_store_name = patch.defaultStore?.name ?? null
        row.default_store_website = patch.defaultStore?.website ?? null
      }
      const { error } = await supabase.from('profiles').update(row).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: profileKey }),
  })
}
