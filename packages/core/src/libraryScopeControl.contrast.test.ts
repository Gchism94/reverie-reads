import { describe, expect, it } from 'vitest'
import { contrastRatio, parseColor } from './adaptive'
import { SKINS, type SkinId } from './skins'
import { SKIN_TOKENS } from './skinTokens.fixture'

// The library scope control sits directly on --card, not --card-solid or --field. Its inactive
// label used to paint --muted there, which axe measured at 3.12:1 in marrow/dark and 1.97:1 in
// grimoire/light. Keep the component on --ink and guard the actual composited card surface in every
// registered skin and mode; adding a skin without a safe pair fails here immediately.

const AA_NORMAL = 4.5
const MODES = ['dark', 'light'] as const
type Rgba = [number, number, number, number]

const rgba = (value: string): Rgba => parseColor(value)! as Rgba
const over = (foreground: Rgba, background: Rgba): Rgba => [
  foreground[0] * foreground[3] + background[0] * (1 - foreground[3]),
  foreground[1] * foreground[3] + background[1] * (1 - foreground[3]),
  foreground[2] * foreground[3] + background[2] * (1 - foreground[3]),
  1,
]

describe('library scope control contrast — every skin × mode', () => {
  for (const skin of Object.keys(SKINS) as SkinId[]) {
    for (const mode of MODES) {
      const tokens = SKIN_TOKENS[`${skin}/${mode}`]

      it(`${skin}/${mode} inactive ink on the painted card clears ${AA_NORMAL}:1`, () => {
        expect(tokens, `add a SKIN_TOKENS row for ${skin}/${mode}`).toBeDefined()
        const cardOnPage = over(rgba(tokens.card), rgba(tokens.bg0))
        const ratio = contrastRatio(rgba(tokens.ink), cardOnPage)
        expect(
          ratio,
          `${skin}/${mode}: ${tokens.ink} on ${tokens.card} over ${tokens.bg0} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA_NORMAL)
      })

      it(`${skin}/${mode} selected label on accent fill clears ${AA_NORMAL}:1`, () => {
        const ratio = contrastRatio(rgba(tokens.onPrimary), rgba(tokens.accentFill))
        expect(
          ratio,
          `${skin}/${mode}: ${tokens.onPrimary} on ${tokens.accentFill} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA_NORMAL)
      })
    }
  }
})
