import { describe, expect, it } from 'vitest'
import { contrastRatio, parseColor } from './adaptive'
import { SKINS, type SkinId } from './skins'

// Skin Character guardrail: the core kit (buttons, chips, labels, numerals on cards/bands) must clear
// WCAG AA at every skin × mode. The character tokens are shape/type/motion (no colour change), but
// this formalizes the text-on-surface combos the kit paints — and is the place to add texture/scrim
// combos as later skins introduce surface material (texture never buries text — the placeholder
// lesson). Keyed off the SKINS registry, so a new skin with no row here fails loudly, not in the sweep.
//
// Mirrors apps/web/src/styles/tokens.css. on-primary/accent-fill = button + active-chip; ink/muted on
// card-solid + bg0 = numerals, labels, body on the kit's surfaces.

const AA = 4.5

type Tok = { bg0: string; cardSolid: string; ink: string; muted: string; accentFill: string; onPrimary: string }

const SKIN_TOKENS: Record<`${SkinId}/${'dark' | 'light'}`, Tok> = {
  'tryst/dark': { bg0: '#0b0612', cardSolid: '#1c0d28', ink: '#f6e9f1', muted: '#b08fae', accentFill: '#cf2f66', onPrimary: '#ffffff' },
  'tryst/light': { bg0: '#fbeee9', cardSolid: '#fff8f5', ink: '#2a1320', muted: '#86566f', accentFill: '#c52e5f', onPrimary: '#ffffff' },
  'grimoire/dark': { bg0: '#0c0f0b', cardSolid: '#161b12', ink: '#ece7d6', muted: '#9aa384', accentFill: '#2f9e74', onPrimary: '#08110b' },
  'grimoire/light': { bg0: '#f1e7cf', cardSolid: '#f7efd9', ink: '#2a2418', muted: '#665e49', accentFill: '#1a6e4c', onPrimary: '#ffffff' },
  'aphelion/dark': { bg0: '#05070d', cardSolid: '#0d1320', ink: '#e6edf7', muted: '#7d8aa6', accentFill: '#1f8fa3', onPrimary: '#02080a' },
  'aphelion/light': { bg0: '#eef3fb', cardSolid: '#f7fafe', ink: '#0e1626', muted: '#51607a', accentFill: '#0a6e80', onPrimary: '#ffffff' },
  'marrow/dark': { bg0: '#0a0a0b', cardSolid: '#161315', ink: '#e8e3da', muted: '#98907f', accentFill: '#8f3535', onPrimary: '#ffffff' },
  'marrow/light': { bg0: '#ece8e0', cardSolid: '#f4f0e8', ink: '#1b1815', muted: '#6a6358', accentFill: '#8a3232', onPrimary: '#ffffff' },
}

const MODES = ['dark', 'light'] as const
const ratio = (a: string, b: string) => contrastRatio(parseColor(a)!, parseColor(b)!)

describe('skin character kit contrast (text on the kit surfaces ≥ AA, every skin × mode)', () => {
  for (const skin of Object.keys(SKINS) as SkinId[]) {
    for (const mode of MODES) {
      const t = SKIN_TOKENS[`${skin}/${mode}`]

      it(`${skin}/${mode} has tokens recorded`, () => {
        expect(t, `add a SKIN_TOKENS row for ${skin}/${mode}`).toBeDefined()
      })

      // text-on-surface pairs the kit relies on: [label, fg, bg]
      const pairs: [string, string, string][] = [
        ['numeral/label on card', t.ink, t.cardSolid],
        ['muted label on card', t.muted, t.cardSolid],
        ['ink on bg', t.ink, t.bg0],
        ['muted on bg', t.muted, t.bg0],
        ['button/active-chip text on accent fill', t.onPrimary, t.accentFill],
      ]
      for (const [name, fg, bg] of pairs) {
        it(`${skin}/${mode} · ${name} clears ${AA}:1`, () => {
          const r = ratio(fg, bg)
          expect(r, `${skin}/${mode} ${name}: ${fg} on ${bg} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
        })
      }
    }
  }
})
