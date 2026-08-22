import { describe, expect, it } from 'vitest'
import { contrastRatio, parseColor } from './adaptive'
import { SKINS, type SkinId } from './skins'
import { SKIN_TOKENS } from './skinTokens.fixture'

/**
 * The Calendar day numeral — NON-TEXT contrast against the PAGE, every skin x mode.
 *
 * ── WHY THIS PAIR IS NEW ────────────────────────────────────────────────────────────────────────
 * The sparse pass removed the day tiles. Previously every numeral sat on `--card` inside a bordered
 * box; now an empty day draws its numeral straight onto `--bg0` with no surface under it at all, and
 * a day with entries draws a heavier numeral on the same page. So the pair the reader depends on
 * changed, and nothing was measuring the new one.
 *
 * ── WHY THE NUMERAL CARRIES MEANING AND NOT JUST TEXT ───────────────────────────────────────────
 * `--ink` vs `--muted` IS the has-something signal now, alongside the dots. That makes the numeral's
 * legibility on the page load-bearing rather than decorative: if the muted numeral washes out, a
 * reader cannot tell an empty day from a missing one, and the grid reads as broken — which is the
 * exact complaint this pass exists to fix.
 *
 * ── WHY THE CONTAINER COULD NOT CARRY IT, MEASURED ──────────────────────────────────────────────
 * The obvious alternative was to keep a filled tile for days with entries. It cannot work: `--card`
 * composited over `--bg0` measures 1.03–2.10:1 across ALL EIGHTEEN combinations, and `--line` over
 * that card measures 1.02–4.06:1, below 3:1 in seventeen. A surface that is invisible against the
 * page cannot say "this day holds something" — the same class of finding as `--accent-fill`, which
 * this repo already records as unusable for anything load-bearing.
 *
 * ── WHY NOT skinCharacter.contrast.test.ts ──────────────────────────────────────────────────────
 * That file asserts text ON a fill at AA 4.5:1. It structurally cannot see this: there is no fill
 * any more. levelRing.contrast.test.ts is the model followed here — a boundary assertion at the
 * 1.4.11 floor, keyed off the SKINS registry so a new skin fails until it has tokens.
 */

/** WCAG 2.2 SC 1.4.11 Non-text Contrast. */
const FLOOR = 3

const ratio = (a: string, b: string) => contrastRatio(parseColor(a)!, parseColor(b)!)

describe('calendar day numeral contrast (every skin x mode)', () => {
  for (const skin of Object.keys(SKINS) as SkinId[]) {
    for (const mode of ['dark', 'light'] as const) {
      const t = SKIN_TOKENS[`${skin}/${mode}`]

      it(`${skin}/${mode} has tokens recorded`, () => {
        expect(t, `add a SKIN_TOKENS row for ${skin}/${mode}`).toBeDefined()
      })

      it(`${skin}/${mode} — an EMPTY day's numeral is readable on the page`, () => {
        const r = ratio(t.muted, t.bg0)
        expect(
          r,
          `${skin}/${mode}: the empty-day numeral is ${r.toFixed(2)}:1 against --bg0. Below ` +
            `${FLOOR}:1 the calendar reads as an unloaded grid rather than a quiet month.`,
        ).toBeGreaterThanOrEqual(FLOOR)
      })

      it(`${skin}/${mode} — a day WITH entries is readable on the page`, () => {
        const r = ratio(t.ink, t.bg0)
        expect(
          r,
          `${skin}/${mode}: the marked-day numeral is ${r.toFixed(2)}:1 against --bg0.`,
        ).toBeGreaterThanOrEqual(FLOOR)
      })
    }
  }

  /**
   * THE RATCHET, MEASURED OFF THIS TREE — never derived. A budget computed from "nine skins, the
   * worst is probably about 4" is indistinguishable from a correct one while it stays green, and
   * slack does not fail: it only stops catching things. These two numbers were read out of the
   * eighteen rows above by printing them, not by reasoning about them.
   */
  const WORST_EMPTY = 4.65 // bloom/light
  const WORST_MARKED = 7.91 // folio/dark

  it('the worst empty-day numeral is still the one that was measured', () => {
    let worst = Infinity
    let where = ''
    for (const skin of Object.keys(SKINS) as SkinId[])
      for (const mode of ['dark', 'light'] as const) {
        const r = ratio(SKIN_TOKENS[`${skin}/${mode}`].muted, SKIN_TOKENS[`${skin}/${mode}`].bg0)
        if (r < worst) {
          worst = r
          where = `${skin}/${mode}`
        }
      }
    expect(
      worst,
      `worst empty-day numeral is now ${worst.toFixed(2)}:1 at ${where}; the recorded floor was ` +
        `${WORST_EMPTY} (bloom/light). If a token moved, re-measure and update this number — do ` +
        `not widen it to make the test pass.`,
    ).toBeGreaterThanOrEqual(WORST_EMPTY - 0.01)
  })

  it('the worst marked-day numeral is still the one that was measured', () => {
    let worst = Infinity
    for (const skin of Object.keys(SKINS) as SkinId[])
      for (const mode of ['dark', 'light'] as const)
        worst = Math.min(
          worst,
          ratio(SKIN_TOKENS[`${skin}/${mode}`].ink, SKIN_TOKENS[`${skin}/${mode}`].bg0),
        )
    expect(worst).toBeGreaterThanOrEqual(WORST_MARKED - 0.01)
  })
})
