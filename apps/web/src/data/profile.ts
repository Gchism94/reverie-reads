import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface Profile {
  id: string
  displayName: string
  goalYear: number | null
  goalTarget: number | null
  autoMergeDuplicates: boolean
}

interface ProfileRow {
  id: string
  display_name: string | null
  goal_year: number | null
  goal_target: number | null
  auto_merge_duplicates: boolean | null
}

export const profileKey = ['profile'] as const

const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  displayName: row.display_name ?? '',
  goalYear: row.goal_year,
  goalTarget: row.goal_target,
  autoMergeDuplicates: row.auto_merge_duplicates ?? true,
})

/** The signed-in user's own profile (RLS returns only their row). */
export function useProfile() {
  return useQuery({
    queryKey: profileKey,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, goal_year, goal_target, auto_merge_duplicates')
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
    }): Promise<void> => {
      const { data: auth } = await supabase.auth.getUser()
      const id = auth.user?.id
      if (!id) throw new Error('Not signed in')
      const row: Partial<ProfileRow> = {}
      if (patch.displayName !== undefined) row.display_name = patch.displayName
      if (patch.goalYear !== undefined) row.goal_year = patch.goalYear
      if (patch.goalTarget !== undefined) row.goal_target = patch.goalTarget
      if (patch.autoMergeDuplicates !== undefined) row.auto_merge_duplicates = patch.autoMergeDuplicates
      const { error } = await supabase.from('profiles').update(row).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: profileKey }),
  })
}
