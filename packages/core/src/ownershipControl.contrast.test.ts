import { describe, expect, it } from 'vitest'
import { contrastRatio, parseColor } from './adaptive'
import { SKINS, type SkinId } from './skins'
import { SKIN_TOKENS } from './skinTokens.fixture'

// The four-state ownership control (docs/archive/task-ownership-v2.md) and the borrowed badge reuse the skin
// tokens the rest of the app is measured against. The SELECTED ownership chip — the "Owned" /
// "Borrowed" / "Wishlist" / "Not set" pill in each skin's voice — paints its label with
// `--on-primary` on the `--accent-fill` surface. This turns "the borrowed treatment passes across
// all nine skins" into an instant, exhaustive catch: keyed off the SKINS registry, it fails loudly
// the moment a skin is added (or an accent retuned) without keeping the selected chip legible.

const AA_NORMAL = 4.5
const MODES = ['dark', 'light'] as const

describe('ownership control contrast — selected chip legible at every skin × mode ≥ AA', () => {
  for (const skin of Object.keys(SKINS) as SkinId[]) {
    for (const mode of MODES) {
      const tokens = SKIN_TOKENS[`${skin}/${mode}`]

      it(`${skin}/${mode} has tokens recorded`, () => {
        expect(tokens, `add a SKIN_TOKENS row for ${skin}/${mode} (see tokens.css)`).toBeDefined()
      })

      it(`${skin}/${mode} · selected chip (on-primary on accent-fill) clears ${AA_NORMAL}:1`, () => {
        const fg = parseColor(tokens.onPrimary)
        const bg = parseColor(tokens.accentFill)
        expect(fg && bg).toBeTruthy()
        const ratio = contrastRatio(fg!, bg!)
        expect(
          ratio,
          `${skin}/${mode}: ${tokens.onPrimary} on ${tokens.accentFill} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA_NORMAL)
      })

      // The UNSELECTED sibling — `--muted` on the browser-painted `--field`-over-card surface
      // (fieldOnCard in the fixture, precomposited like pickRing). This is the pair no token-level
      // test saw until the nine-skin axe sweep measured it at 3.92:1 in hearth/dark (2026-08-10):
      // the default --field LIGHTENS a dark card toward the light muted text, and hearth's lamplit
      // linen had the least headroom. hearth now overrides --field per-mode in tokens.css; this
      // assertion is what keeps the composed surface from drifting under again, in ANY skin.
      it(`${skin}/${mode} · unselected chip (muted on field-over-card) clears ${AA_NORMAL}:1`, () => {
        const fg = parseColor(tokens.muted)
        const bg = parseColor(tokens.fieldOnCard)
        expect(fg && bg).toBeTruthy()
        const ratio = contrastRatio(fg!, bg!)
        expect(
          ratio,
          `${skin}/${mode}: ${tokens.muted} on ${tokens.fieldOnCard} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA_NORMAL)
      })
    }
  }
})
