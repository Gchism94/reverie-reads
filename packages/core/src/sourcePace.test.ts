import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SOURCE_BUDGETS, sourceBudgetKey, waitMsFor, type PacedSource } from './sourcePace'

// The pacing policy, and the parity guard that keeps the Deno copy honest.
//
// WHAT THIS CANNOT DO, STATED PLAINLY. The enforcement lives in a Deno Edge Function, and this repo
// has no Deno test runner — `deno` is installed neither locally nor in CI. So nothing here executes
// `paceSource` itself; a test that claimed to would be one that never runs, which is worse than
// none. What IS testable is the part that actually goes wrong: the numbers, and the arithmetic that
// turns them into a wait. The cross-file assertion below reads the Deno source and fails when the
// two tables diverge, which is the real drift risk in a copied constant.

describe('the documented limits are what we encode', () => {
  it("Open Library covers: 100 per 5 minutes, spaced 3s — their doc's number, not a guess", () => {
    expect(SOURCE_BUDGETS['ol-covers']).toEqual({ max: 100, windowSecs: 300, gapMs: 3000 })
  })

  it('Open Library search is budgeted SEPARATELY — a different endpoint with a different limit', () => {
    // The IDENTIFIED tier (feat/discover-phase-a): 3 req/s for a User-Agent carrying app name +
    // contact email, which _shared/olIdentity.ts now sends on every OL call (olIdentity.test.ts is
    // the guard tying this budget to that header — this number is only lawful while the header
    // ships). 3/s → 180 per 60s window; gap 334ms = 1000/3 rounded UP, so the sustained in-process
    // rate is ≤ 2.994/s and can never exceed the documented 3.
    expect(SOURCE_BUDGETS['ol-search']).toEqual({ max: 180, windowSecs: 60, gapMs: 334 })
    expect(SOURCE_BUDGETS['ol-search'].gapMs).toBeGreaterThanOrEqual(Math.ceil(1000 / 3))
    // Sharing one budget would let search traffic spend the covers allowance, which is the bug
    // that made "we're within the limit" untrue while both were called from the same sweep.
    expect(sourceBudgetKey('ol-covers')).not.toBe(sourceBudgetKey('ol-search'))
  })

  it('Open Library covers is NOT retuned to the identified tier — its doc has no such tier', () => {
    // covers.openlibrary.org's limit is per-IP ("100 requests/IP ... every 5 minutes") with no
    // User-Agent provision at all, so tripling it alongside ol-search would program the budget
    // ABOVE the source's own documented cap. This assertion exists so the covers budget cannot be
    // swept along by a future retune of the search tier without meeting this stated reason.
    expect(SOURCE_BUDGETS['ol-covers']).toEqual({ max: 100, windowSecs: 300, gapMs: 3000 })
  })

  it('every budget is a real cap: positive, and a gap that cannot be zero for a rate-limited source', () => {
    for (const [name, b] of Object.entries(SOURCE_BUDGETS)) {
      expect(b.max, name).toBeGreaterThan(0)
      expect(b.windowSecs, name).toBeGreaterThan(0)
      expect(b.gapMs, name).toBeGreaterThan(0)
    }
  })

  it('the old client-side 220ms is slower than nothing but faster than every OL gap — the bug it replaced', () => {
    expect(SOURCE_BUDGETS['ol-covers'].gapMs).toBeGreaterThan(220)
    expect(SOURCE_BUDGETS['ol-search'].gapMs).toBeGreaterThan(220)
  })
})

describe('waitMsFor — a caller cannot get through faster than the gap', () => {
  it('the first call waits for nothing', () => {
    expect(waitMsFor('ol-covers', null, 1_000_000)).toBe(0)
  })

  it('an immediate second call waits the FULL gap', () => {
    expect(waitMsFor('ol-covers', 1_000_000, 1_000_000)).toBe(3000)
  })

  it('waits only the remainder when some of the gap has already passed', () => {
    expect(waitMsFor('ol-covers', 1_000_000, 1_002_000)).toBe(1000)
  })

  it('is due immediately once the gap has elapsed, and is never owed negative time', () => {
    expect(waitMsFor('ol-covers', 1_000_000, 1_003_000)).toBe(0)
    expect(waitMsFor('ol-covers', 1_000_000, 9_999_999)).toBe(0)
  })

  // THE PROPERTY THE BRIEF ASKED FOR, as arithmetic: however tightly a caller loops, the enforced
  // spacing means N calls cannot occupy less than (N-1) x gap. A caller cannot outrun it by asking
  // faster, because each call's wait is computed from the previous call's actual time.
  it.each(['ol-covers', 'ol-search'] as PacedSource[])(
    '%s: a tight loop of 10 calls still spans at least 9 gaps',
    (source) => {
      const gap = SOURCE_BUDGETS[source].gapMs
      let now = 0
      let last: number | null = null
      for (let i = 0; i < 10; i++) {
        now += waitMsFor(source, last, now) // the caller is forced to wait
        last = now
      }
      expect(now).toBe(9 * gap)
    },
  )

  it('a caller that ignores the wait still cannot spend more than the window budget', () => {
    // The second mechanism: the gap shapes the traffic, the budget caps it. Even a caller that
    // somehow skipped every sleep is stopped by rate_limit_consume at `max` per window.
    const b = SOURCE_BUDGETS['ol-covers']
    expect(b.max).toBe(100)
    expect(b.windowSecs).toBe(300)
  })
})

describe('the Deno runtime mirrors this table exactly', () => {
  // It cannot import from this package, so it holds a copy. This is the guard that the copy has not
  // drifted — the failure mode being a limit raised here and silently left alone over there.
  it('supabase/functions/_shared/sourcePace.ts declares the same numbers', () => {
    const denoSrc = readFileSync(
      join(__dirname, '../../../supabase/functions/_shared/sourcePace.ts'),
      'utf8',
    )
    for (const [name, b] of Object.entries(SOURCE_BUDGETS)) {
      const key = name.includes('-') ? `'${name}'` : name
      const line = denoSrc
        .split('\n')
        .find((l) => l.trim().startsWith(`${key}:`) && l.includes('max:'))
      expect(line, `${name} missing from the Deno mirror`).toBeTruthy()
      expect(line, `${name} max`).toContain(`max: ${b.max}`)
      expect(line, `${name} windowSecs`).toContain(`windowSecs: ${b.windowSecs}`)
      expect(line, `${name} gapMs`).toContain(`gapMs: ${b.gapMs}`)
    }
  })

  it('and every source in this table exists there — neither file may gain one alone', () => {
    const denoSrc = readFileSync(
      join(__dirname, '../../../supabase/functions/_shared/sourcePace.ts'),
      'utf8',
    )
    const denoType = /export type PacedSource =([^\n]*)/.exec(denoSrc)?.[1] ?? ''
    for (const name of Object.keys(SOURCE_BUDGETS)) {
      expect(denoType, `${name} missing from the Deno PacedSource union`).toContain(`'${name}'`)
    }
  })
})
