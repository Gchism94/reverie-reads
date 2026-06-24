import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type SharedKind = 'list' | 'clubtbr'

export interface SharedListItem {
  id: string
  title: string
  author: string
  cover: string
  by: string
}

export interface SharedListDoc {
  type: 'list'
  kind: SharedKind
  name: string
  items: SharedListItem[]
  updatedAt: number
}

export interface SharedRef {
  code: string
  kind: SharedKind
  name: string
}

export const sharedRefsKey = ['shared-refs'] as const
export const sharedDocKey = (code: string) => ['shared-doc', code] as const

function genCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
}

/** The shared lists / club TBRs this user has created or joined. */
export function useMySharedRefs() {
  return useQuery({
    queryKey: sharedRefsKey,
    queryFn: async (): Promise<SharedRef[]> => {
      const { data, error } = await supabase.from('shared_refs').select('code, kind, name').order('created_at', { ascending: false })
      if (error) throw error
      return (data as { code: string; kind: SharedKind; name: string | null }[]).map((r) => ({
        code: r.code,
        kind: r.kind,
        name: r.name ?? 'Shared list',
      }))
    },
  })
}

/** Read one shared document by its capability code. */
export function useSharedDoc(code: string) {
  return useQuery({
    queryKey: sharedDocKey(code),
    queryFn: async (): Promise<SharedListDoc | null> => {
      const { data, error } = await supabase.from('shared_docs').select('value').eq('key', code).maybeSingle()
      if (error) throw error
      return data ? ((data as { value: SharedListDoc }).value ?? null) : null
    },
    enabled: !!code,
  })
}

export function useCreateSharedList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; kind: SharedKind }): Promise<string> => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) throw new Error('Not signed in')
      const code = genCode()
      const doc: SharedListDoc = { type: 'list', kind: input.kind, name: input.name, items: [], updatedAt: Date.now() }
      const { error } = await supabase.from('shared_docs').insert({ key: code, value: doc })
      if (error) throw error
      const { error: re } = await supabase.from('shared_refs').insert({ owner_id: uid, code, kind: input.kind, name: input.name })
      if (re) throw re
      return code
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: sharedRefsKey }),
  })
}

/** Join a shared list by code: load it and record a local reference. */
export function useJoinSharedList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (code: string): Promise<SharedListDoc | null> => {
      const trimmed = code.trim().toUpperCase()
      const { data, error } = await supabase.from('shared_docs').select('value').eq('key', trimmed).maybeSingle()
      if (error) throw error
      const doc = data ? (data as { value: SharedListDoc }).value : null
      if (!doc) return null
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (uid) {
        await supabase
          .from('shared_refs')
          .upsert({ owner_id: uid, code: trimmed, kind: doc.kind, name: doc.name }, { onConflict: 'owner_id,code' })
      }
      return doc
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: sharedRefsKey }),
  })
}

/** Add/remove items on a shared doc (read-modify-write, last-write-wins). */
export function useMutateSharedDoc(code: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (update: (doc: SharedListDoc) => SharedListDoc): Promise<void> => {
      const { data, error } = await supabase.from('shared_docs').select('value').eq('key', code).single()
      if (error) throw error
      const current = (data as { value: SharedListDoc }).value
      const next = { ...update(current), updatedAt: Date.now() }
      const { error: ue } = await supabase.from('shared_docs').update({ value: next, updated_at: new Date().toISOString() }).eq('key', code)
      if (ue) throw ue
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: sharedDocKey(code) }),
  })
}

export function useLeaveSharedList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (code: string): Promise<void> => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) return
      const { error } = await supabase.from('shared_refs').delete().eq('owner_id', uid).eq('code', code)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: sharedRefsKey }),
  })
}
