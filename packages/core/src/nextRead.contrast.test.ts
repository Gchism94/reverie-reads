import { describe, expect, it } from 'vitest'
import { contrastRatio, parseColor } from './adaptive'
import { SKINS, type SkinId } from './skins'
import { SKIN_TOKENS } from './skinTokens.fixture'

type Rgba = [number, number, number, number]
const rgba = (value: string) => parseColor(value)! as Rgba
const over = (fg: Rgba, bg: Rgba): Rgba => [
  fg[0] * fg[3] + bg[0] * (1 - fg[3]),
  fg[1] * fg[3] + bg[1] * (1 - fg[3]),
  fg[2] * fg[3] + bg[2] * (1 - fg[3]),
  1,
]

describe('Next read cards and reading actions in every room and mode', () => {
  for (const skin of Object.keys(SKINS) as SkinId[]) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${skin}/${mode} keeps the title, explanation, and reading action legible`, () => {
        const tokens = SKIN_TOKENS[`${skin}/${mode}`]
        expect(tokens, 'each registered room needs measured tokens').toBeDefined()
        expect(
          contrastRatio(rgba(tokens.ink), over(rgba(tokens.card), rgba(tokens.bg0))),
        ).toBeGreaterThanOrEqual(4.5)
        expect(
          contrastRatio(rgba(tokens.onPrimary), rgba(tokens.accentFill)),
        ).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})
