import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { canonicalPairKeys, type ConsolidationSeries } from '@reverie/core'

// THE SUPPRESSION GUARD, at rendered output — the load-bearing test of the Tier 3 queue.
//
// A queue that re-proposes a pair the reader already ruled on is worse than no queue: it turns
// one-time triage back into a recurring prompt, which is the exact failure the decision table
// exists to prevent. So the assertion here is about what the SURFACE DISPLAYS, not what
// proposeConsolidation returns — the pipeline under test runs whole: the rulings query (through a
// mocked supabase, the deepest seam), the proposal computation, and the rendered queue.
//
// Negative-assertion discipline (AGENTS.md): every "X is absent" below is anchored to a sibling
// that the SAME render pass and the SAME machinery produced — the banner's count, or the other
// pair's card — so absence cannot be confused with a pipeline that never ran.
//
// Named mutants, each run by hand against these tests (revert via scripts/safe-revert.sh):
//   MUTANT ruled-filter-dropped — in proposeConsolidation (seriesConsolidation.ts), delete the
//     `if (ruled.has(pairId(a.key, b.key))) continue` line in the Tier 3 loop. "a distinct ruling
//     suppresses…" fails twice: the banner says 2 pairs, and the ACOTAR card renders.
//   MUTANT tier2-not-silent — in ConsolidationQueue, change the queue filter to
//     `candidates.filter((c) => c.tier !== 3)` (or include tier 2). "Tier 2 merges silently…"
//     fails: a banner renders where the test proves none may.
//   MUTANT tier2-loop — in useTier2AutoMerge, stop recording the pair in `attempted`. "…exactly
//     once" fails: the rerender fires the same merge again.

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = []
let rulingRows: { name_key_a: string; name_key_b: string; ruling: string }[] = []
/** How many times the rulings table was read — the observable that a post-merge invalidation's
 *  REFETCH happened, which is the moment a loop-guard mutant would fire its second merge. */
let rulingSelects = 0

vi.mock('../lib/supabase', async () => {
  const { pagedSelect } = await import('../data/pagedSelect.fixture')
  return {
    supabase: {
      from: (table: string) => ({
        select: () => {
          if (table !== 'series_merge_decisions') throw new Error(`unexpected table ${table}`)
          // Still counts ONE per read while the table fits in a page, so the refetch observable
          // these tests depend on is unchanged by paging.
          rulingSelects++
          return pagedSelect(() => rulingRows)
        },
      }),
      rpc: (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args })
        if (fn === 'record_series_ruling') {
          rulingRows = [
            ...rulingRows,
            {
              name_key_a: String(args.p_name_key_a),
              name_key_b: String(args.p_name_key_b),
              ruling: String(args.p_ruling),
            },
          ]
        }
        return Promise.resolve({ data: null, error: null })
      },
    },
  }
})

const { ConsolidationQueue } = await import('./ConsolidationQueue')

function wrap(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const S = (id: string, name: string, liveEntries = 0, memberBooks = 0): ConsolidationSeries => ({
  id,
  name,
  liveEntries,
  memberBooks,
})

// Two Tier 3 pairs, zero Tier 2 pairs — the initialism archetype and its sibling.
const acotar = S('s-a', 'ACOTAR', 1, 1)
const acotnr = S('s-b', 'A Court of Thorns and Roses', 7, 3)
const tog = S('s-c', 'TOG', 0, 1)
const throne = S('s-d', 'Throne of Glass', 3, 3)
const FOUR = [acotar, acotnr, tog, throne]

const ACOTAR_KEYS = canonicalPairKeys('acotar', 'courtofthornsandroses')

beforeEach(() => {
  rpcCalls.length = 0
  rulingRows = []
  rulingSelects = 0
})

describe('the Tier 3 queue, rendered', () => {
  it('positive control: with no rulings, both pairs surface and both cards render on Review', async () => {
    wrap(<ConsolidationQueue rows={FOUR} />)
    await screen.findByText('2 pairs of series look like duplicates.')
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByText('ACOTAR')).toBeInTheDocument()
    expect(screen.getByText('Throne of Glass')).toBeInTheDocument()
  })

  it('a distinct ruling suppresses the ruled pair from the rendered queue — the other pair is the proof the queue ran', async () => {
    rulingRows = [{ name_key_a: ACOTAR_KEYS[0], name_key_b: ACOTAR_KEYS[1], ruling: 'distinct' }]
    wrap(<ConsolidationQueue rows={FOUR} />)
    // The anchor: the UNRULED pair, produced by the same fetch, the same computation, the same
    // render pass. Only once it is on screen does the ACOTAR absence mean "suppressed" rather
    // than "nothing loaded yet".
    await screen.findByText('1 pair of series looks like a duplicate.')
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByText('Throne of Glass')).toBeInTheDocument()
    expect(screen.queryByText('ACOTAR')).toBeNull()
    expect(screen.queryByText('A Court of Thorns and Roses')).toBeNull()
  })

  it('related_but_separate is a reachable third outcome, and ruling it retires the pair from the surface', async () => {
    wrap(<ConsolidationQueue rows={[acotar, acotnr]} />)
    await screen.findByText('1 pair of series looks like a duplicate.')
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))
    await userEvent.click(screen.getByRole('button', { name: 'Related, but separate' }))

    const call = await waitFor(() => {
      const c = rpcCalls.find((c) => c.fn === 'record_series_ruling')
      expect(c).toBeDefined()
      return c!
    })
    expect(call.args.p_ruling).toBe('related_but_separate')
    expect([call.args.p_name_key_a, call.args.p_name_key_b]).toEqual(ACOTAR_KEYS)
    // The banner was on screen when we clicked, so waiting for it to LEAVE cannot pass vacuously.
    await waitFor(() => expect(screen.queryByText(/looks? like (a )?duplicate/)).toBeNull())
  })

  it('merging passes the reader-chosen survivor, not only the default', async () => {
    wrap(<ConsolidationQueue rows={[acotar, acotnr]} />)
    await screen.findByText('1 pair of series looks like a duplicate.')
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))
    // Default primary is the heavier row (A Court…). Choose the OTHER survivor.
    await userEvent.click(screen.getByRole('radio', { name: /^ACOTAR/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Same series — merge' }))
    await waitFor(() => {
      const call = rpcCalls.find((c) => c.fn === 'merge_series')
      expect(call).toBeDefined()
      expect(call!.args.p_primary).toBe('s-a')
      expect(call!.args.p_loser).toBe('s-b')
    })
  })
})

describe('Tier 2, from the same mount', () => {
  const fate = S('s-f1', 'The Freckled Fate', 4, 4)
  const fateSeries = S('s-f2', 'The Freckled Fate Series', 0, 1)

  it('merges the exact-variant pair silently — the RPC fires and NOTHING renders, exactly once', async () => {
    const { container } = wrap(<ConsolidationQueue rows={[fate, fateSeries]} />)
    // The anchor for the silence claim is the rpc call itself: once the merge has provably fired,
    // an empty container means "silent", not "not loaded".
    await waitFor(() => {
      const call = rpcCalls.find((c) => c.fn === 'merge_series')
      expect(call).toBeDefined()
      expect(call!.args.p_primary).toBe('s-f1')
      expect(call!.args.p_loser).toBe('s-f2')
    })
    expect(container.textContent).toBe('')
    // The merge's own invalidation refetches the rulings, which hands the effect a fresh candidate
    // list — the exact moment an unguarded loop would fire the same merge again (the test's rows
    // prop never changes, so the candidate is still there). Wait for that refetch to have
    // OBSERVABLY happened, then assert the call count held.
    await waitFor(() => expect(rulingSelects).toBeGreaterThanOrEqual(2))
    expect(rpcCalls.filter((c) => c.fn === 'merge_series')).toHaveLength(1)
  })

  it('a ruling on the exact-variant pair blocks even the automatic merge', async () => {
    const key = 'freckledfate'
    rulingRows = [{ name_key_a: key, name_key_b: key, ruling: 'distinct' }]
    // The ruled Tier 2 pair rides with an UNRULED Tier 3 pair: the Tier 3 banner appearing proves
    // the rulings loaded and the whole proposal computation ran — the moment a wrongly-live Tier 2
    // merge would already have fired. Only then does "no rpc happened" mean "blocked".
    wrap(<ConsolidationQueue rows={[fate, fateSeries, acotar, acotnr]} />)
    await screen.findByText('1 pair of series looks like a duplicate.')
    expect(rpcCalls).toHaveLength(0)
  })
})
