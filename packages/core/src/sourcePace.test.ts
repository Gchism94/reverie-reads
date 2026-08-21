import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SOURCE_BUDGETS, sourceBudgetKey } from './sourcePace'

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
