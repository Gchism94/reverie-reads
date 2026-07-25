import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Book } from '@reverie/core'
import { supabase } from '../lib/supabase'
import { isOwned, ownedKeys, type DiscoverHit } from '../lib/discover'

// Releases / author-following (owner-approved run). The library DERIVES "your authors" — anyone
// behind a loved book (rating ≥ 4 or fave) or two-plus shelved books; author_follows rows pin an
// author in ('followed') or out ('muted'). The releases fn serves each author's recent + upcoming
// shelf from the global cache; the client accumulates across calls (cached names are free,
// upstream fetches are budgeted per request), then windows/dedupes/owner-filters locally.

export type FollowState = 'followed' | 'muted'

const primaryAuthor = (b: Book): string =>
  (b.contributors[0]?.name ?? [b.first, b.last].filter(Boolean).join(' ')).trim()

/** The derived author list, follows applied, alphabetical. Capped — a 300-book library can name
 *  dozens of authors; the cap keeps fn round-trips sane and the rail readable. */
export function yourAuthors(books: readonly Book[], follows: Record<string, FollowState>, cap = 20): string[] {
  const stats = new Map<string, { count: number; loved: boolean }>()
  for (const b of books) {
    const name = primaryAuthor(b)
    if (!name) continue
    const s = stats.get(name) ?? { count: 0, loved: false }
    s.count += 1
    if (b.rating >= 4 || b.fave) s.loved = true
    stats.set(name, s)
  }
  const derived = [...stats.entries()].filter(([, s]) => s.loved || s.count >= 2)
  const set = new Map(derived)
  for (const [name, state] of Object.entries(follows)) {
    if (state === 'followed') set.set(name, set.get(name) ?? { count: 99, loved: true }) // pinned
    else set.delete(name)
  }
  // the cap keeps the reader's STRONGEST authors (loved, then shelf depth), not the alphabet's
  return [...set.entries()]
    .sort(([an, a], [bn, b]) => Number(b.loved) - Number(a.loved) || b.count - a.count || an.localeCompare(bn))
    .slice(0, cap)
    .map(([n]) => n)
    .sort((a, b) => a.localeCompare(b))
}

export interface AuthorRelease extends DiscoverHit {
  author: string
}

/** Window an author-shelf map into the Planner's two external sections: upcoming (soonest first)
 *  and recently released (newest first, last ~6 months) — excluding anything already shelved. */
export function releaseWindow(
  shelves: Record<string, DiscoverHit[]>,
  books: readonly Book[],
  now: number,
): { upcoming: AuthorRelease[]; recent: AuthorRelease[] } {
  const owned = ownedKeys(books)
  const seen = new Set<string>()
  const sixMonthsAgo = now - 183 * 864e5
  const upcoming: { r: AuthorRelease; t: number }[] = []
  const recent: { r: AuthorRelease; t: number }[] = []
  for (const [author, hits] of Object.entries(shelves)) {
    for (const h of hits) {
      // a year-only date means "sometime this year, TBD" — parse to year-end so it windows as
      // upcoming and sorts AFTER concretely-dated releases
      const t = Date.parse(h.pub.length === 4 ? `${h.pub}-12-31` : h.pub)
      if (Number.isNaN(t) || t < sixMonthsAgo) continue
      if (isOwned(h, owned)) continue
      const k = `${h.title.toLowerCase()}|${(h.authors[0] ?? '').toLowerCase()}`
      if (seen.has(k)) continue
      seen.add(k)
      ;(t > now ? upcoming : recent).push({ r: { ...h, author }, t })
    }
  }
  upcoming.sort((a, b) => a.t - b.t)
  recent.sort((a, b) => b.t - a.t)
  return { upcoming: upcoming.map((x) => x.r), recent: recent.map((x) => x.r) }
}

export const followsKey = ['author-follows'] as const

export function useAuthorFollows() {
  return useQuery({
    queryKey: followsKey,
    queryFn: async (): Promise<Record<string, FollowState>> => {
      const { data, error } = await supabase.from('author_follows').select('author_name, state')
      if (error) throw error
      return Object.fromEntries((data as { author_name: string; state: FollowState }[]).map((r) => [r.author_name, r.state]))
    },
  })
}

/** Cycle an author: derived → muted → derived (or, for a non-derived name, followed → gone). */
export function useSetFollow() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'Release tracking' },
    mutationFn: async ({ name, state }: { name: string; state: FollowState | null }): Promise<void> => {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('Not signed in')
      if (state === null) {
        const { error } = await supabase.from('author_follows').delete().eq('user_id', userId).eq('author_name', name)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('author_follows')
          .upsert({ user_id: userId, author_name: name, state }, { onConflict: 'user_id,author_name' })
        if (error) throw error
      }
    },
    onMutate: async ({ name, state }) => {
      await qc.cancelQueries({ queryKey: followsKey })
      const previous = qc.getQueryData<Record<string, FollowState>>(followsKey)
      qc.setQueryData<Record<string, FollowState>>(followsKey, (old) => {
        const next = { ...(old ?? {}) }
        if (state === null) delete next[name]
        else next[name] = state
        return next
      })
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(followsKey, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: followsKey }),
  })
}

/** Per-author shelves via the releases fn — accumulates until nothing is pending (cached names
 *  return instantly; each call spends a small upstream budget). Progressive: partial shelves
 *  render as they land. Unavailability leaves the map empty — the rail simply doesn't render. */
export function useAuthorReleases(names: readonly string[]) {
  const [shelves, setShelves] = useState<Record<string, DiscoverHit[]>>({})
  const namesKey = names.join('|')
  const running = useRef<string | null>(null)

  // Keyed on namesKey ONLY: `names` is a fresh array identity every render, and depending on it
  // makes any re-render mid-loop run the cleanup (cancelling the run) while the running guard
  // blocks a restart — the shelves silently never fill. The key carries the same information.
  useEffect(() => {
    const keyNames = namesKey ? namesKey.split('|') : []
    if (!keyNames.length || running.current === namesKey) return
    running.current = namesKey
    let cancelled = false
    void (async () => {
      let remaining = keyNames
      let misses = 0
      for (let call = 0; call < 10 && remaining.length && !cancelled; call++) {
        try {
          const { data, error } = await supabase.functions.invoke('releases', { body: { mode: 'authors', names: remaining } })
          // one flaky call must not discard the run — skip it and let the next call retry
          if (error || !(data as { authors?: unknown })?.authors) {
            if (++misses >= 3) return
            continue
          }
          const d = data as { authors: Record<string, DiscoverHit[]>; pending?: string[] }
          if (!cancelled) setShelves((old) => ({ ...old, ...d.authors }))
          remaining = d.pending ?? []
        } catch {
          if (++misses >= 3) return // enhancement only
        }
      }
    })()
    return () => {
      // reset the guard too: a cancelled run must not tombstone its key, or a remount with the
      // same names (StrictMode's double-mount, tab away/back) can never start a fresh loop
      cancelled = true
      running.current = null
    }
  }, [namesKey])

  return useMemo(() => shelves, [shelves])
}
