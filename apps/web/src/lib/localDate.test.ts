import { afterEach, describe, expect, it, vi } from 'vitest'
import { todayLocalDate } from './localDate'

// TIMEZONE-DEPENDENT TESTS ARE USUALLY FLAKY because they read the ambient wall clock and the
// runner's ambient TZ, neither of which the test controls. Two independent fixes here, not one:
//
//   1. A fixed instant, not `new Date()`. The bug is invisible for most of the day (local and UTC
//      agree except near midnight), so a test against "right now" would pass or fail depending on
//      what time it happens to run — exactly the flakiness this file exists to avoid.
//   2. `vi.stubEnv('TZ', ...)` forces the OFFSET too, so the test doesn't inherit whatever zone the
//      CI runner happens to be in. Verified this actually takes effect in this Node version before
//      relying on it: setting `process.env.TZ` mid-process, before constructing a `Date`, changes
//      both `Intl.DateTimeFormat().resolvedOptions().timeZone` and that `Date`'s local getters.
//      `vi.stubEnv` restores the prior value; `vi.unstubAllEnvs()` in `afterEach` is the safety net
//      in case a test throws before Vitest's own cleanup runs.
//
// Together: this test passes under the correct implementation and fails under the reverted one
// (`new Date().toISOString().slice(0, 10)`), in EVERY timezone this suite might run under — not
// just the one the author happened to be sitting in.

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('todayLocalDate', () => {
  it('reads the LOCAL calendar day off the Date object', () => {
    // The contract, independent of any timezone: a Date built from LOCAL parts (the constructor's
    // (y, monthIndex, day, ...) form) must read back as that same local day. This holds no matter
    // what TZ the test runs under, because "local" is relative to whatever zone is active — it is
    // what distinguishes a local-getter implementation from a UTC one in the first place.
    const d = new Date(2026, 0, 15, 23, 30, 0) // Jan 15 2026, 23:30, LOCAL
    expect(todayLocalDate(d)).toBe('2026-01-15')
  })

  it('does NOT drift to tomorrow west of UTC in the evening — the exact bug this replaces', () => {
    // America/Chicago in January is UTC-6, comfortably reproducing "west of UTC in the evening"
    // without depending on wherever this suite actually runs.
    vi.stubEnv('TZ', 'America/Chicago')
    const lateEvening = new Date(2026, 0, 15, 23, 30, 0) // Jan 15, 23:30 LOCAL (Chicago)

    // Prove the bug is real UNDER THIS FORCED OFFSET, not asserted from memory: the reverted
    // expression reads a day later, because 23:30 CST is 05:30 UTC the next calendar day.
    expect(lateEvening.toISOString().slice(0, 10)).toBe('2026-01-16')

    // The fix does not drift — same local evening, same local day.
    expect(todayLocalDate(lateEvening)).toBe('2026-01-15')
  })

  it('still agrees with toISOString at a UTC-safe moment, so this is about midnight, not about UTC itself', () => {
    // Local noon has enormous slack either side of the UTC day boundary — no real-world timezone
    // offset (they cap out at UTC+14/-12) pushes a local NOON across a UTC midnight. Confirms the
    // two implementations only diverge where the actual bug lives: near midnight, not everywhere.
    vi.stubEnv('TZ', 'America/Chicago')
    const noon = new Date(2026, 0, 15, 12, 0, 0)
    expect(todayLocalDate(noon)).toBe(noon.toISOString().slice(0, 10))
  })

  it('pads single-digit month and day', () => {
    const d = new Date(2026, 2, 5, 9, 0, 0) // March 5 — month index 2, day 5
    expect(todayLocalDate(d)).toBe('2026-03-05')
  })

  it('defaults to the current instant when called with no argument', () => {
    // Not a timezone assertion — just confirms the default parameter actually reads `new Date()`
    // rather than silently requiring a caller to pass one everywhere `todayLocalDate()` is used.
    const before = new Date()
    const result = todayLocalDate()
    const after = new Date()
    expect(result >= todayLocalDate(before)).toBe(true)
    expect(result <= todayLocalDate(after)).toBe(true)
  })
})
