import { describe, expect, it } from 'vitest'
import { contrastRatio, parseColor } from './adaptive'
import { SKINS, type SkinId } from './skins'
import { SKIN_TOKENS, type Tok } from './skinTokens.fixture'

// The picked-cover accent ring (polish/spine-pick-feel) is a decorative, non-text indicator around
// the magnified pick — WCAG 1.4.11's 3:1 non-text bar, not the 4.5:1 text bar. It sits directly on
// the shelf's own page background (SpineShelf renders straight on <body>, no intervening panel), so
// this is keyed off the SKINS registry exactly like state pill contrast: a tenth skin with no
// SKIN_TOKENS row fails here before it can ship a ring nobody can see.
//
// --pick-ring itself is translucent for 15 of 18 skin×mode combinations (color-mix(…, transparent)),
// so `pickRing` in the fixture is the value the browser actually PAINTS — alpha-composited over
// bg0 the same way box-shadow rendering does — not the token's authored formula. Measuring the
// formula instead of the paint is exactly the state-pill test's disclaimed failure mode.

const AA_GRAPHICAL = 3 // WCAG 1.4.11 non-text contrast — the ring is decoration, not a word
const MODES = ['dark', 'light'] as const

describe('picked-cover ring contrast — legible at every skin × mode, against the shelf background', () => {
  const ratioOf = (fg: string, bg: string): number => {
    const f = parseColor(fg)
    const b = parseColor(bg)
    expect(f && b, `unparseable colour: ${fg} on ${bg}`).toBeTruthy()
    return contrastRatio(f!, b!)
  }

  for (const skin of Object.keys(SKINS) as SkinId[]) {
    for (const mode of MODES) {
      const key = `${skin}/${mode}` as const
      const tokens: Tok | undefined = SKIN_TOKENS[key]

      it(`${key} has tokens recorded`, () => {
        expect(tokens, `add a SKIN_TOKENS row for ${key}`).toBeDefined()
      })

      it(`${key} · ring (pickRing on bg0) clears ${AA_GRAPHICAL}:1`, () => {
        const ratio = ratioOf(tokens.pickRing, tokens.bg0)
        expect(
          ratio,
          `${key}: ${tokens.pickRing} on ${tokens.bg0} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA_GRAPHICAL)
      })
    }
  }
})
