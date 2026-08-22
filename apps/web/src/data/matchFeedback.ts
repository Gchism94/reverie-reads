import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { pageAll } from './paging'

// Match feedback, server-side (owner-approved dev path): "not tonight" survives the device.
// The map shape the matcher consumes stays exactly what localStorage held — bookId → epoch ms —
// so scoring code doesn't know the storage moved. The old per-device localStorage map migrates
// up once (original timestamps preserved: the 60-day novelty decay window keeps its meaning),
// then the key is cleared.

export const matchFeedbackKey = ['match-feedback'] as const

/** The v1 per-device store — read once for migration, then retired. */
export const LEGACY_DISMISS_KEY = 'reverie.match.dismissed.v1'

interface FeedbackRow {
  book_id: string
  at: string
}

/** rows → the matcher's dismissedAt map (bookId → epoch ms); unparseable stamps are skipped */
export function toDismissedMap(rows: readonly FeedbackRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const t = Date.parse(r.at)
    if (!Number.isNaN(t)) out[r.book_id] = t
  }
  return out
}

/** The legacy entries worth pushing up: still in the library (a dismissal of a deleted book is
 *  meaningless) and not already recorded server-side (first writer wins — it has the older stamp). */
export function legacyEntriesToMigrate(
  raw: string | null,
  serverMap: Record<string, number>,
  libraryIds: ReadonlySet<string>,
): { bookId: string; at: number }[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []
  const out: { bookId: string; at: number }[] = []
  for (const [bookId, at] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof at !== 'number' || !Number.isFinite(at)) continue
    if (!libraryIds.has(bookId) || serverMap[bookId] != null) continue
    out.push({ bookId, at })
  }
  return out
}

/** The signed-in reader's dismissals (bookId → epoch ms). */
export function useDismissed() {
  return useQuery({
    queryKey: matchFeedbackKey,
    queryFn: async (): Promise<Record<string, number>> => {
      const data = await pageAll<FeedbackRow>('match_feedback', (from, to) =>
        supabase
          .from('match_feedback')
          .select('book_id, at', { count: 'exact' })
          .eq('kind', 'dismissed')
          .order('book_id')
          .range(from, to),
      )
      return toDismissedMap(data)
    },
  })
}

/** Optimistically record a "not tonight" — the pick vanishes now, the row lands when it lands. */
export function useDismissBook() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'Your feedback' },
    mutationFn: async (bookId: string): Promise<void> => {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('Not signed in')
      const { error } = await supabase
        .from('match_feedback')
        .upsert(
          { user_id: userId, book_id: bookId, kind: 'dismissed', at: new Date().toISOString() },
          { onConflict: 'user_id,book_id,kind' },
        )
      if (error) throw error
    },
    onMutate: async (bookId) => {
      await qc.cancelQueries({ queryKey: matchFeedbackKey })
      const previous = qc.getQueryData<Record<string, number>>(matchFeedbackKey)
      qc.setQueryData<Record<string, number>>(matchFeedbackKey, (old) => ({ ...(old ?? {}), [bookId]: Date.now() }))
      return { previous }
    },
    onError: (_err, _bookId, ctx) => {
      if (ctx?.previous) qc.setQueryData(matchFeedbackKey, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: matchFeedbackKey }),
  })
}

/** One-shot per mount: push the legacy per-device map up (original stamps kept), then clear it.
 *  On upload failure the key stays put and the next visit retries — nothing is lost quietly. */
export function useLegacyDismissalSync(libraryIds: ReadonlySet<string> | null) {
  const q = useDismissed()
  const qc = useQueryClient()
  const ran = useRef(false)
  const serverMap = q.isSuccess ? q.data : null
  useEffect(() => {
    if (ran.current || !libraryIds || !serverMap) return
    ran.current = true
    let raw: string | null = null
    try {
      raw = window.localStorage?.getItem(LEGACY_DISMISS_KEY)
    } catch {
      return
    }
    if (raw == null) return
    const entries = legacyEntriesToMigrate(raw, serverMap, libraryIds)
    void (async () => {
      if (entries.length) {
        const { data: auth } = await supabase.auth.getUser()
        const userId = auth.user?.id
        if (!userId) return
        const rows = entries.map((e) => ({
          user_id: userId,
          book_id: e.bookId,
          kind: 'dismissed',
          at: new Date(e.at).toISOString(),
        }))
        const { error } = await supabase.from('match_feedback').upsert(rows, { onConflict: 'user_id,book_id,kind' })
        if (error) return // key survives; next visit retries
        await qc.invalidateQueries({ queryKey: matchFeedbackKey })
      }
      try {
        window.localStorage?.removeItem(LEGACY_DISMISS_KEY)
      } catch {
        /* cosmetic — the entries are already up or empty */
      }
    })()
  }, [libraryIds, serverMap, qc])
}
