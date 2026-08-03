// Per-SOURCE pacing for outbound catalog calls, enforced SERVER-SIDE so no caller can skip it.
//
// ── Why this is not in the client ───────────────────────────────────────────────────────────────
// The gap used to live in `bulkComplete`'s loop as `THROTTLE_MS = 220` — 4.5 requests/second, under
// a comment quoting "Open Library 100/IP/5min", which is one per THREE seconds. Two problems, and
// the second is the one that matters: the number was wrong by ~13x, and it was in the wrong place.
// `importEnrich.ts` calls `bulkComplete` directly and anything else may call the enrich function
// straight over HTTP, so a client-side sleep paces exactly one code path and nothing else. Moving it
// here means every caller — this function's own adapters, a future script, a curl — passes through
// the same gate, because the gate is on the far side of the network boundary from all of them.
//
// ── Two mechanisms, because one is not enough ───────────────────────────────────────────────────
// 1. A DISTRIBUTED BUDGET via `rate_limit_consume`, keyed per source. Edge functions are stateless
//    and concurrent: an in-memory timestamp paces one isolate and knows nothing about the other
//    three serving requests beside it. The budget is in Postgres, so it is shared across isolates
//    and survives a cold start. This reuses the same RPC + bucket pattern `globalBudget` already
//    used for Hardcover in the search and covers functions.
// 2. An IN-PROCESS MINIMUM GAP, because a budget is a counter, not a spacing rule: 100-per-5-minutes
//    permits all 100 in the first second and then nothing for 299. Open Library's limit is a budget,
//    but hammering it in a burst is exactly the "bulk download" behaviour their docs ask us not to
//    do. The gap makes the traffic look like what it is — a library filling in slowly.
//
// ── The numbers, from the sources' own documentation (verified live, 2026-08-03) ────────────────
//   openlibrary.org/search   1 req/s anonymous; 3 req/s identified — "a User-Agent string with (a)
//                            the name of your application and (b) your contact email". We now send
//                            exactly that (_shared/olIdentity.ts, guard-tested), so the budget is
//                            the identified tier: 3/s → 180 / 60s, and a 334ms floor (1000/3 rounded
//                            up, so the sustained rate stays ≤ 2.99/s — never over the documented 3).
//   covers.openlibrary.org   "Currently only 100 requests/IP are allowed for every 5 minutes" — for
//                            lookups by ISBN/OCLC/etc. DELIBERATELY NOT retuned to the identified
//                            tier: the covers doc's limit is per-IP with no User-Agent tier at all,
//                            so 3x-ing this budget would program it above the source's own cap.
//                            (CoverID lookups — our `/b/id/{cover_i}` URLs — are documented as not
//                            rate-limited, so 100/300s is conservative posture, kept as-is.)
// These are DIFFERENT endpoints with DIFFERENT limits and are budgeted separately; treating them as
// one source is how the covers budget gets spent by search traffic.
//
// Fails OPEN on limiter error, like `rateLimit` — a limiter hiccup must never be the thing that
// stops a reader's library from filling in.

import type { Trace } from './trace.ts'

const DB_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

export type PacedSource = 'ol-covers' | 'ol-search' | 'google' | 'hardcover' | 'isbndb'

interface Budget {
  /** requests permitted per window (the source's documented cap) */
  max: number
  windowSecs: number
  /** minimum milliseconds between two calls to this source from one isolate */
  gapMs: number
}

// MIRROR OF packages/core/src/sourcePace.ts's SOURCE_BUDGETS. Deno cannot import from that package,
// so this is a copy — and `sourcePace.test.ts` over there READS this file and fails if the numbers
// ever diverge. Change them there and here, or the gate catches it.
const BUDGETS: Record<PacedSource, Budget> = {
  'ol-covers': { max: 100, windowSecs: 300, gapMs: 3000 },
  'ol-search': { max: 180, windowSecs: 60, gapMs: 334 },
  google: { max: 100, windowSecs: 60, gapMs: 200 },
  hardcover: { max: 60, windowSecs: 60, gapMs: 1000 },
  isbndb: { max: 60, windowSecs: 60, gapMs: 1000 },
}

/** Last call per source, per isolate. Deliberately module-scope: it is the in-process half. */
const lastCallAt = new Map<PacedSource, number>()

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** The shared budget key. Global, not per-caller: the cap is on OUR egress IP, not on each reader. */
export const sourceBudgetKey = (source: PacedSource): string => `source:${source}:global`

/**
 * Wait out this source's minimum gap, then consume one unit of its global budget.
 * Returns false when the budget is exhausted — the caller should treat that as rate-limited and
 * stop, exactly as it already treats an upstream 429.
 */
export async function paceSource(source: PacedSource, trace?: Trace): Promise<boolean> {
  const b = BUDGETS[source]

  // 1. In-process spacing. Timed SEPARATELY from the budget round trip below: these are the two
  //    mechanisms this module deliberately runs, and "the sweep is slow because of pacing" is only
  //    answerable if you can see which of them the time went to. A wait of 0 is itself the finding
  //    when the HTTP call before it already exceeded the gap.
  const t0 = performance.now()
  const last = lastCallAt.get(source)
  if (last !== undefined) {
    const wait = b.gapMs - (Date.now() - last)
    if (wait > 0) await sleep(wait)
  }
  lastCallAt.set(source, Date.now())
  trace?.mark(`pace.${source}.wait`, performance.now() - t0)

  // 2. Distributed budget — one HTTP round trip to PostgREST per call, which is a cost in its own
  //    right and is NOT pacing. Six of these per book was invisible before it was timed.
  if (!DB_URL || !SERVICE) return true // fail open
  const t1 = performance.now()
  try {
    const r = await fetch(`${DB_URL}/rest/v1/rpc/rate_limit_consume`, {
      method: 'POST',
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_key: sourceBudgetKey(source),
        p_max: b.max,
        p_window_secs: b.windowSecs,
      }),
    })
    if (!r.ok) return true // fail open
    return !!((await r.json()) as { allowed?: boolean }).allowed
  } catch {
    return true // fail open
  } finally {
    // `finally`, so a fail-open path still reports what the round trip cost — a limiter that is slow
    // AND erroring is the case most worth seeing, and an early `return` would skip the mark.
    trace?.mark(`pace.${source}.rpc`, performance.now() - t1)
  }
}

/** Test seam: forget in-process spacing so a suite isn't paced by a previous case's clock. */
export function _resetPaceForTests(): void {
  lastCallAt.clear()
}
