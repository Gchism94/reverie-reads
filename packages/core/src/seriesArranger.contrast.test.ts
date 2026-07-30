import { describe, expect, it } from 'vitest'
import { contrastRatio, parseColor } from './adaptive'
import { SKINS, type SkinId } from './skins'
import { SKIN_TOKENS, type Tok } from './skinTokens.fixture'
import { SERIES_ARRANGER_TOKENS, SERIES_ARRANGER_TOKEN_FIELDS } from './seriesIndex'

// The /series index's arranging rows (feat/series-builder), held to contrast at every skin × mode.
//
// This layer is here because the e2e axe sweep is NOT exhaustive: it runs four skins of nine, and
// only `tryst` gets the full route list — the other three get a core subset that this route is not
// in. So on five skins, and in three of the four swept skins, nothing would ever look at these rows.
// Keyed off the SKINS registry rather than a hand-written list, so a tenth skin without a
// SKIN_TOKENS row fails here before it can ship an arranger nobody can read.
//
// What each pair carries, and why its bar is what it is:
//   • TITLE (--ink on --card) is the book's name — the thing you read to know which row you are
//     moving. Body copy, so AA normal text, 4.5:1.
//   • POSITION (--muted on --card) is "#3". It is the ONLY thing distinguishing two rows of the same
//     book in a reread, and the number a reader checks after a drag to confirm the move landed. That
//     makes it read text, not decoration, so it is held to 4.5:1 rather than the 3:1 glyph bar.
//   • GRIP and NUDGE glyphs (--muted on --card) are controls — ⠿ and ▲▼. Non-text, 3:1. They ride on
//     the same token as the position, so in practice they clear the higher bar too; the separate
//     assertion pins the INTENT, so a future token change that drops --muted to 3.5:1 fails on the
//     position and passes here, which is the correct pair of signals rather than one ambiguous one.
//
// The ghost slot's dashed placeholder is deliberately NOT asserted as a contrast pair: it is a
// container, its `⊹` is aria-hidden decoration beside the title that carries the meaning, and the
// row's accessible name never depends on it.

const AA_NORMAL = 4.5
const AA_GRAPHICAL = 3
const MODES = ['dark', 'light'] as const

describe('series arranger — the tokens the rows actually use', () => {
  it('names the token fields this test measures, so the two cannot drift', () => {
    expect(SERIES_ARRANGER_TOKENS).toEqual({
      surface: 'var(--card)',
      title: 'var(--ink)',
      meta: 'var(--muted)',
    })
    expect(SERIES_ARRANGER_TOKEN_FIELDS).toEqual({
      surface: 'cardSolid',
      title: 'ink',
      meta: 'muted',
    })
  })

  it('uses no translucent surface — a row sits on a solid card, never a scrim', () => {
    for (const v of Object.values(SERIES_ARRANGER_TOKENS)) {
      expect(v).not.toMatch(/rgba?\(|transparent|color-mix/)
    }
  })
})

describe('series arranger contrast — every skin, both modes', () => {
  const ratioOf = (fg: string, bg: string): number => {
    const f = parseColor(fg)
    const b = parseColor(bg)
    expect(f && b, `unparseable colour: ${fg} on ${bg}`).toBeTruthy()
    return contrastRatio(f!, b!)
  }

  for (const skin of Object.keys(SKINS) as SkinId[]) {
    for (const mode of MODES) {
      const tokens: Tok = SKIN_TOKENS[`${skin}/${mode}`]

      it(`${skin}/${mode} · book title (ink on card) clears ${AA_NORMAL}:1`, () => {
        const ratio = ratioOf(tokens.ink, tokens.cardSolid)
        expect(
          ratio,
          `${skin}/${mode}: ${tokens.ink} on ${tokens.cardSolid} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA_NORMAL)
      })

      it(`${skin}/${mode} · position "#N" (muted on card) clears ${AA_NORMAL}:1 — it is read, not decor`, () => {
        const ratio = ratioOf(tokens.muted, tokens.cardSolid)
        expect(
          ratio,
          `${skin}/${mode}: ${tokens.muted} on ${tokens.cardSolid} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA_NORMAL)
      })

      it(`${skin}/${mode} · grip and ▲▼ glyphs (muted on card) clear ${AA_GRAPHICAL}:1`, () => {
        const ratio = ratioOf(tokens.muted, tokens.cardSolid)
        expect(
          ratio,
          `${skin}/${mode}: ${tokens.muted} on ${tokens.cardSolid} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA_GRAPHICAL)
      })
    }
  }
})
