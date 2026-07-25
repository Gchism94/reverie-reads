import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClubUnitType } from '@reverie/core'
import { supabase } from '../lib/supabase'

export interface Club {
  id: string
  title: string
  author: string
  cover: string
  unitType: ClubUnitType
  unitCount: number
  unitLabel: string
  joinCode: string
  createdBy: string
}

export interface ClubMember {
  userId: string
  displayName: string
  progress: number
}

export interface ClubComment {
  id: string
  userId: string
  unit: number
  body: string
  createdAt: string
  hidden: boolean
}

interface ClubRow {
  id: string
  title: string
  author: string | null
  cover_url: string | null
  unit_type: ClubUnitType
  unit_count: number | null
  unit_label: string | null
  join_code: string
  created_by: string
}

const UNIT_LABEL: Record<ClubUnitType, string> = { chapter: 'Chapter', page: 'Page', percent: 'Percent' }

const toClub = (r: ClubRow): Club => ({
  id: r.id,
  title: r.title,
  author: r.author ?? '',
  cover: r.cover_url ?? '',
  unitType: r.unit_type,
  unitCount: r.unit_count ?? (r.unit_type === 'percent' ? 100 : 1),
  unitLabel: r.unit_label ?? UNIT_LABEL[r.unit_type],
  joinCode: r.join_code,
  createdBy: r.created_by,
})

export const clubsKey = ['clubs'] as const
export const clubKey = (id: string) => ['club', id] as const
export const clubMembersKey = (id: string) => ['club-members', id] as const
export const clubCommentsKey = (id: string) => ['club-comments', id] as const
export const clubLockedKey = (id: string) => ['club-locked', id] as const

/** The read-alongs the user belongs to (RLS scopes clubs to members/creator). */
export function useMyClubs() {
  return useQuery({
    queryKey: clubsKey,
    queryFn: async (): Promise<Club[]> => {
      const { data, error } = await supabase.from('clubs').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return (data as ClubRow[]).map(toClub)
    },
  })
}

export function useClub(id: string) {
  return useQuery({
    queryKey: clubKey(id),
    queryFn: async (): Promise<Club | null> => {
      const { data, error } = await supabase.from('clubs').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data ? toClub(data as ClubRow) : null
    },
    enabled: !!id,
  })
}

export function useClubMembers(id: string) {
  return useQuery({
    queryKey: clubMembersKey(id),
    queryFn: async (): Promise<ClubMember[]> => {
      const { data, error } = await supabase
        .from('club_members')
        .select('user_id, display_name, progress')
        .eq('club_id', id)
      if (error) throw error
      return (data as { user_id: string; display_name: string | null; progress: number }[]).map((m) => ({
        userId: m.user_id,
        displayName: m.display_name ?? 'Reader',
        progress: m.progress,
      }))
    },
    enabled: !!id,
  })
}

/** Comments the caller is allowed to see — RLS hides anything past their progress. */
export function useClubComments(id: string) {
  return useQuery({
    queryKey: clubCommentsKey(id),
    queryFn: async (): Promise<ClubComment[]> => {
      const { data, error } = await supabase
        .from('club_comments')
        .select('id, user_id, unit, body, created_at, hidden')
        .eq('club_id', id)
        .order('unit', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data as { id: string; user_id: string; unit: number; body: string; created_at: string; hidden: boolean | null }[]).map((c) => ({
        id: c.id,
        userId: c.user_id,
        unit: c.unit,
        body: c.body,
        createdAt: c.created_at,
        hidden: c.hidden ?? false,
      }))
    },
    enabled: !!id,
  })
}

/** Count + next-unlock for the comments still spoiler-locked for the caller. */
export function useClubLockedInfo(id: string) {
  return useQuery({
    queryKey: clubLockedKey(id),
    queryFn: async (): Promise<{ hidden: number; nextUnit: number | null }> => {
      const { data, error } = await supabase.rpc('club_locked_info', { p_club: id })
      if (error) throw error
      const row = (data as { hidden: number; next_unit: number | null }[])[0]
      return { hidden: row?.hidden ?? 0, nextUnit: row?.next_unit ?? null }
    },
    enabled: !!id,
  })
}

export function useCreateClub() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The club' },
    mutationFn: async (input: {
      title: string
      author: string
      cover: string
      unitType: ClubUnitType
      unitCount: number
      displayName: string
    }): Promise<Club> => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) throw new Error('Not signed in')
      const { data, error } = await supabase
        .from('clubs')
        .insert({
          title: input.title,
          author: input.author || null,
          cover_url: input.cover || null,
          unit_type: input.unitType,
          unit_count: input.unitType === 'percent' ? 100 : input.unitCount,
          unit_label: UNIT_LABEL[input.unitType],
          created_by: uid,
        })
        .select()
        .single()
      if (error) throw error
      const club = toClub(data as ClubRow)
      const { error: me } = await supabase
        .from('club_members')
        .insert({ club_id: club.id, user_id: uid, display_name: input.displayName, progress: 0 })
      if (me) throw me
      return club
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clubsKey }),
  })
}

/** Join a read-along by code (RPC). Returns the club id, or null if the code is unknown. */
export function useJoinClub() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The club' },
    mutationFn: async ({ code, displayName }: { code: string; displayName: string }): Promise<string | null> => {
      const { data, error } = await supabase.rpc('join_club_by_code', { p_code: code, p_name: displayName })
      if (error) throw error
      return (data as string | null) ?? null
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clubsKey }),
  })
}

export function useSetProgress(id: string) {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The club' },
    mutationFn: async (progress: number): Promise<void> => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) throw new Error('Not signed in')
      const { error } = await supabase
        .from('club_members')
        .update({ progress })
        .eq('club_id', id)
        .eq('user_id', uid)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clubMembersKey(id) })
      void qc.invalidateQueries({ queryKey: clubCommentsKey(id) })
      void qc.invalidateQueries({ queryKey: clubLockedKey(id) })
    },
  })
}

export function usePostComment(id: string) {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The club' },
    mutationFn: async ({ unit, body }: { unit: number; body: string }): Promise<void> => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) throw new Error('Not signed in')
      const { error } = await supabase.from('club_comments').insert({ club_id: id, user_id: uid, unit, body })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clubCommentsKey(id) }),
  })
}

/** Author self-takedown: hide/unhide your own club comment (others stop seeing a hidden one). */
export function useSetCommentHidden(id: string) {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The club' },
    mutationFn: async ({ commentId, hidden }: { commentId: string; hidden: boolean }): Promise<void> => {
      const { error } = await supabase.from('club_comments').update({ hidden }).eq('id', commentId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clubCommentsKey(id) }),
  })
}

export function useLeaveClub() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The club' },
    mutationFn: async (id: string): Promise<void> => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) throw new Error('Not signed in')
      const { error } = await supabase.from('club_members').delete().eq('club_id', id).eq('user_id', uid)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clubsKey }),
  })
}
