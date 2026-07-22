import { describe, expect, it } from 'vitest'
import { contrastRatio, parseColor } from './adaptive'
import { SKINS, type SkinId } from './skins'
import { SKIN_TOKENS } from './skinTokens.fixture'

// The mood chip (docs/task-mood.md §3) renders in a "felt" register distinct from the trope chip:
// an assigned mood paints its label with `--ink` on the `--card` surface, ringed by an `--accent-ink`
// hairline with a small accent-ink dot. Keyed off the SKINS registry, this pins both:
//   • the LABEL (ink on card) clears AA normal-text (4.5:1) — it must be as legible as body copy;
//   • the ACCENT (accent-ink on card) clears the 3:1 graphical/non-text bar — enough to read the
//     ring + dot as an accent without being asked to carry text.
// It fails loudly the moment a skin is added or an accent retuned without keeping the chip legible.

const AA_NORMAL = 4.5
const AA_GRAPHICAL = 3
const MODES = ['dark', 'light'] as const

describe('mood chip contrast — assigned chip legible at every skin × mode', () => {
  for (const skin of Object.keys(SKINS) as SkinId[]) {
    for (const mode of MODES) {
      const tokens = SKIN_TOKENS[`${skin}/${mode}`]

      it(`${skin}/${mode} has tokens recorded`, () => {
        expect(tokens, `add a SKIN_TOKENS row for ${skin}/${mode}`).toBeDefined()
      })

      it(`${skin}/${mode} · label (ink on card) clears ${AA_NORMAL}:1`, () => {
        const fg = parseColor(tokens.ink)
        const bg = parseColor(tokens.cardSolid)
        expect(fg && bg).toBeTruthy()
        const ratio = contrastRatio(fg!, bg!)
        expect(ratio, `${skin}/${mode}: ${tokens.ink} on ${tokens.cardSolid} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL)
      })

      it(`${skin}/${mode} · accent (accent-ink on card) clears ${AA_GRAPHICAL}:1`, () => {
        const fg = parseColor(tokens.accentInk)
        const bg = parseColor(tokens.cardSolid)
        expect(fg && bg).toBeTruthy()
        const ratio = contrastRatio(fg!, bg!)
        expect(ratio, `${skin}/${mode}: ${tokens.accentInk} on ${tokens.cardSolid} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_GRAPHICAL)
      })
    }
  }
})
