import { describe, expect, it } from 'vitest'
import { contrastRatio, parseColor } from './adaptive'
import { SKINS, type SkinId } from './skins'
import { SKIN_TOKENS } from './skinTokens.fixture'

/**
 * The Spice / Darkness level ring — NON-TEXT contrast, every skin x mode.
 *
 * ── WHY THIS ASSERTS A BOUNDARY AND NOT A TEXT PAIR ─────────────────────────────────────────────
 * skinCharacter.contrast.test.ts is text-on-surface at AA 4.5:1. It structurally cannot see this
 * defect: it asserts text ON a fill, so a fill that is invisible AGAINST ITS SURFACE passes there
 * while the control's boundary disappears. WCAG 1.4.11 is the applicable rule and its floor is
 * 3:1 — the visual information needed to identify the control and its state.
 *
 * ── WHAT THE READER NEEDS, AND WHY ONE PAIR COVERS BOTH ─────────────────────────────────────────
 * The ring is drawn in --muted on the card. Ring PRESENT says "this control exists"; ring FILLED
 * says "this level is set". Both readings are the same --muted vs --card comparison, so a single
 * assertion carries presence and state together — an unfilled ring's interior is the card, and a
 * filled one is muted, which is exactly the pair below.
 *
 * ── WHAT THIS REPLACED ──────────────────────────────────────────────────────────────────────────
 * `opacity: i <= value ? 1 : 0.3` on a bare glyph. Measured in a real browser (the glyphs are
 * EMOJI — their colour comes from the font, so no token can predict it): the unselected state
 * failed 3:1 in all EIGHTEEN combinations, 1.08–1.38:1, for BOTH axes. Opacity composites any
 * glyph toward its own background by construction, so no glyph choice could have fixed it.
 *
 * ── WHY NOT --accent-fill ───────────────────────────────────────────────────────────────────────
 * It cannot carry this. Measured against the card: almanac/dark 1.00:1 (it IS the card colour),
 * hearth/dark 1.48, tryst/dark 2.30, bloom/dark 2.76 — four skins where a control relying on it
 * would be invisible. It may decorate; nothing may depend on it. See docs/backlog/BACKLOG.md.
 */

/** WCAG 2.2 SC 1.4.11 Non-text Contrast. */
const FLOOR = 3

const ratio = (a: string, b: string) => contrastRatio(parseColor(a)!, parseColor(b)!)

describe('level ring contrast (Spice + Darkness pickers, every skin x mode)', () => {
  for (const skin of Object.keys(SKINS) as SkinId[]) {
    for (const mode of ['dark', 'light'] as const) {
      const t = SKIN_TOKENS[`${skin}/${mode}`]

      it(`${skin}/${mode} has tokens recorded`, () => {
        expect(t, `add a SKIN_TOKENS row for ${skin}/${mode}`).toBeDefined()
      })

      it(`${skin}/${mode} — the ring clears 3:1 against the card it sits on`, () => {
        const r = ratio(t.muted, t.card)
        expect(
          r,
          `${skin}/${mode}: the level ring is ${r.toFixed(2)}:1 against --card. Below ${FLOOR}:1 a ` +
            `reader cannot see which levels are set, or that the picker is there at all.`,
        ).toBeGreaterThanOrEqual(FLOOR)
      })
    }
  }

  /**
   * The RATCHET, and its number is MEASURED off this tree rather than derived — a budget computed
   * from "9 skins x 2 modes, the worst should be about 4.5" is indistinguishable from a correct one
   * for as long as it stays green, and only stops catching things. Printed from the failure message
   * of a deliberately-impossible assertion, then written down:
   *
   *   worst pair = hearth/dark, 4.51:1
   *
   * Held at 4.5 against a measured 4.5055 — 0.0055 of slack, which is as close to none as a float
   * comparison safely allows. Slack is what makes a ratchet toothless, so there is none to spare.
   */
  it('the worst pair across all eighteen still clears the recorded floor', () => {
    let worst = Infinity
    let where = ''
    for (const skin of Object.keys(SKINS) as SkinId[]) {
      for (const mode of ['dark', 'light'] as const) {
        const t = SKIN_TOKENS[`${skin}/${mode}`]
        if (!t) continue
        const r = ratio(t.muted, t.card)
        if (r < worst) {
          worst = r
          where = `${skin}/${mode}`
        }
      }
    }
    expect(
      worst,
      `the worst level-ring pair is now ${where} at ${worst.toFixed(2)}:1 — it was hearth/dark at ` +
        `4.51:1 when this ratchet was measured. If a token change lowered it deliberately, ` +
        `re-measure and move the number; do not widen it to fit.`,
    ).toBeGreaterThanOrEqual(4.5)
  })
})
