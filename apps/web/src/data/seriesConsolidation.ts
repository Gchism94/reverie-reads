import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  canonicalPairKeys,
  type ConsolidationCandidate,
  type DecidedSeriesPair,
  type SeriesRuling,
} from '@reverie/core'
import { supabase } from '../lib/supabase'
import { pageAll } from './paging'
import { booksKey } from './books'
import { seriesKey, seriesListKey } from './series'

/**
 * The decision table and the two consolidation RPCs (fix/series-consolidation, PR 3).
 *
 * Proposals are computed CLIENT-SIDE (packages/core/src/seriesConsolidation.ts) and the RPCs take
 * pre-computed name keys — that is the RPC contract (20260822010000: keys are "supplied by the
 * caller, never recomputed in SQL"), kept so seriesNameKey stays the single implementation of the
 * normalization rule. This module is only the wiring: read the rulings, call the RPCs, invalidate
 * what they touched.
 */

export const seriesRulingsKey = ['seriesRulings'] as const

interface RulingRowT {
  name_key_a: string
  name_key_b: string
  ruling: string
}

/** Every ruling the reader has made — the suppression set for the proposal computation. */
export function useSeriesRulings() {
  return useQuery({
    queryKey: seriesRulingsKey,
    queryFn: async (): Promise<DecidedSeriesPair[]> => {
      const data = await pageAll<RulingRowT>('series_merge_decisions', (from, to) =>
        supabase
          .from('series_merge_decisions')
          .select('name_key_a, name_key_b, ruling', { count: 'exact' })
          .order('id')
          .range(from, to),
      )
      return data.map((r) => ({
        nameKeyA: r.name_key_a,
        nameKeyB: r.name_key_b,
        ruling: r.ruling as SeriesRuling,
      }))
    },
  })
}

const invalidateAfterMerge = (
  qc: ReturnType<typeof useQueryClient>,
  c: ConsolidationCandidate,
) => {
  void qc.invalidateQueries({ queryKey: seriesListKey })
  void qc.invalidateQueries({ queryKey: booksKey })
  void qc.invalidateQueries({ queryKey: seriesRulingsKey })
  // both names' detail caches — the loser's is now a dangling name, the primary's gained cargo
  void qc.invalidateQueries({ queryKey: seriesKey(c.primary.name) })
  void qc.invalidateQueries({ queryKey: seriesKey(c.loser.name) })
}

/** Accepting a 'same' — merge_series performs the merge AND records the ruling in one
 *  transaction; recording 'same' without merging is refused server-side by design. */
export function useMergeSeries() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The series merge' },
    mutationFn: async (c: ConsolidationCandidate) => {
      const { error } = await supabase.rpc('merge_series', {
        p_primary: c.primary.id,
        p_loser: c.loser.id,
        p_name_key_a: c.nameKeyA,
        p_name_key_b: c.nameKeyB,
      })
      if (error) throw error
    },
    onSuccess: (_d, c) => invalidateAfterMerge(qc, c),
  })
}

/** Ruling 'distinct' or 'related_but_separate' — the two outcomes that leave both rows standing.
 *  The ruling is what un-proposes the pair, so only the rulings query needs refetching. */
export function useRecordSeriesRuling() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The series ruling' },
    mutationFn: async (input: {
      candidate: ConsolidationCandidate
      ruling: 'distinct' | 'related_but_separate'
    }) => {
      const [a, b] = canonicalPairKeys(input.candidate.nameKeyA, input.candidate.nameKeyB)
      const { error } = await supabase.rpc('record_series_ruling', {
        p_series_a: input.candidate.primary.id,
        p_series_b: input.candidate.loser.id,
        p_name_key_a: a,
        p_name_key_b: b,
        p_ruling: input.ruling,
      })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: seriesRulingsKey }),
  })
}

/**
 * Tier 2's trigger — WHERE the automatic merge fires, decided here rather than left implicit.
 *
 * It fires on a visit to /series (this hook is mounted by the consolidation surface there), never
 * at app load. The spec's "automatic, silent" was a decision about PROMPTING — no confirmation
 * theatre for a pair with no judgment in it — not about timing, and merge_series deletes a row.
 * A destructive write belongs where its effect is in front of the reader: on /series the two rows
 * visibly become one on the page whose whole job is series records, instead of the row count
 * silently changing during a splash screen. Load-time firing would also put an RPC burst in every
 * session's critical path and race concurrent tabs; here it runs only when someone is actually
 * looking at series, which any duplicate-producing session eventually does.
 *
 * One merge in flight at a time, and each pair is attempted once per mount: the candidate list
 * recomputes after each merge's invalidation settles (the merged pair drops out of it), and a
 * failing RPC must not retry in a loop — `attempted` remembers the pair for this surface's
 * lifetime so an error leaves the pair alone until the next visit.
 */
export function useTier2AutoMerge(candidates: readonly ConsolidationCandidate[]) {
  const merge = useMergeSeries()
  const attempted = useRef<Set<string>>(new Set())
  const busy = useRef(false)
  useEffect(() => {
    if (busy.current) return
    const next = candidates.find(
      (c) => c.tier === 2 && !attempted.current.has(`${c.primary.id}:${c.loser.id}`),
    )
    if (!next) return
    attempted.current.add(`${next.primary.id}:${next.loser.id}`)
    busy.current = true
    merge.mutate(next, { onSettled: () => (busy.current = false) })
  }, [candidates, merge])
}
