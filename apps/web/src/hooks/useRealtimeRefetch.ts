import { useEffect } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Subscribe to Postgres changes on one or more tables and invalidate the given query keys
 * when anything changes — so collaborators' edits appear live. RLS still gates what each
 * subscriber receives. `channel` should be unique and stable for the subscription's lifetime.
 */
export function useRealtimeRefetch(
  channel: string,
  subs: { table: string; filter?: string }[],
  keys: QueryKey[],
) {
  const qc = useQueryClient()
  // Serialize inputs so the effect only re-subscribes when they truly change.
  const subsId = JSON.stringify(subs)
  const keysId = JSON.stringify(keys)

  useEffect(() => {
    const ch = supabase.channel(channel)
    for (const s of JSON.parse(subsId) as { table: string; filter?: string }[]) {
      ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: s.table, ...(s.filter ? { filter: s.filter } : {}) },
        () => {
          for (const k of JSON.parse(keysId) as QueryKey[]) void qc.invalidateQueries({ queryKey: k })
        },
      )
    }
    ch.subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [channel, subsId, keysId, qc])
}
