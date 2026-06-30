import { describe, expect, it } from 'vitest'
import { contrastRatio, mixSrgb, parseColor } from './adaptive'
import { SKINS, type SkinId } from './skins'

// Skin Character guardrail: the core kit (buttons, chips, labels, numerals on cards/bands) must clear
// WCAG AA at every skin × mode. The character tokens are shape/type/motion (no colour change), but
// this formalizes the text-on-surface combos the kit paints. Stage 1b adds the MATERIAL layer — the
// nameplate plate, the gilt/instrument eyebrow, and the card marks over their scrim — and proves the
// headline invariant: texture never buries text (text always sits on the opaque --panel-fill / a
// deep mark scrim, never the raw grain/mesh). Keyed off the SKINS registry, so a new skin with no row
// here fails loudly, not in the sweep.
//
// Mirrors apps/web/src/styles/tokens.css. on-primary/accent-fill = button + active-chip; ink/muted on
// card-solid + bg0 = numerals, labels, body on the kit's surfaces. accentInk = the Nameplate eyebrow;
// markAccent = the card-mark accent (= --accent), shown only over dark scrims (see the marks note).

const AA = 4.5

type Tok = {
  bg0: string
  cardSolid: string
  ink: string
  muted: string
  accentFill: string
  onPrimary: string
  /** --accent-ink: the gilt/instrument eyebrow text on the nameplate (--panel-fill = card-solid) */
  accentInk: string
  /** --mark-accent (= --accent): card-mark glyph; only painted over a DARK scrim (dark mode / covers) */
  markAccent: string
}

const SKIN_TOKENS: Record<`${SkinId}/${'dark' | 'light'}`, Tok> = {
  'tryst/dark': { bg0: '#0b0612', cardSolid: '#1c0d28', ink: '#f6e9f1', muted: '#b08fae', accentFill: '#cf2f66', onPrimary: '#ffffff', accentInk: '#f0b14e', markAccent: '#f0b14e' },
  'tryst/light': { bg0: '#fbeee9', cardSolid: '#fff8f5', ink: '#2a1320', muted: '#86566f', accentFill: '#c52e5f', onPrimary: '#ffffff', accentInk: '#8a5a1f', markAccent: '#c9842f' },
  'grimoire/dark': { bg0: '#0c0f0b', cardSolid: '#161b12', ink: '#ece7d6', muted: '#9aa384', accentFill: '#2f9e74', onPrimary: '#08110b', accentInk: '#ece7d6', markAccent: '#d4af37' },
  'grimoire/light': { bg0: '#f1e7cf', cardSolid: '#f7efd9', ink: '#2a2418', muted: '#665e49', accentFill: '#1a6e4c', onPrimary: '#ffffff', accentInk: '#2a2418', markAccent: '#b08828' },
  'aphelion/dark': { bg0: '#05070d', cardSolid: '#0d1320', ink: '#e6edf7', muted: '#7d8aa6', accentFill: '#1f8fa3', onPrimary: '#02080a', accentInk: '#4fd1e0', markAccent: '#4fd1e0' },
  'aphelion/light': { bg0: '#eef3fb', cardSolid: '#f7fafe', ink: '#0e1626', muted: '#51607a', accentFill: '#0a6e80', onPrimary: '#ffffff', accentInk: '#0a6e80', markAccent: '#0a6e80' },
  'marrow/dark': { bg0: '#0a0a0b', cardSolid: '#161315', ink: '#e8e3da', muted: '#98907f', accentFill: '#8f3535', onPrimary: '#ffffff', accentInk: '#e8e3da', markAccent: '#8c9a3c' },
  'marrow/light': { bg0: '#ece8e0', cardSolid: '#f4f0e8', ink: '#1b1815', muted: '#6a6358', accentFill: '#8a3232', onPrimary: '#ffffff', accentInk: '#1b1815', markAccent: '#6f7a2e' },
}

const MODES = ['dark', 'light'] as const
const ratio = (a: string, b: string) => contrastRatio(parseColor(a)!, parseColor(b)!)
/** A `rgba(0,0,0,α)` scrim over a surface, the way the cover marks composite. */
const scrim = (surface: string, alpha: number) => mixSrgb('#000000', surface, alpha)

describe('skin character kit contrast (text on the kit surfaces ≥ AA, every skin × mode)', () => {
  for (const skin of Object.keys(SKINS) as SkinId[]) {
    for (const mode of MODES) {
      const t = SKIN_TOKENS[`${skin}/${mode}`]

      it(`${skin}/${mode} has tokens recorded`, () => {
        expect(t, `add a SKIN_TOKENS row for ${skin}/${mode}`).toBeDefined()
      })

      // text-on-surface pairs the kit relies on: [label, fg, bg]
      // The nameplate/stat plate uses the OPAQUE --panel-fill (= card-solid), so plate text reuses the
      // card pairs; the eyebrow adds the accent-tinted text token on that same plate.
      const pairs: [string, string, string][] = [
        ['numeral/label on card', t.ink, t.cardSolid],
        ['muted label on card', t.muted, t.cardSolid],
        ['ink on bg', t.ink, t.bg0],
        ['muted on bg', t.muted, t.bg0],
        ['button/active-chip text on accent fill', t.onPrimary, t.accentFill],
        ['nameplate eyebrow (accent-ink) on plate', t.accentInk, t.cardSolid],
      ]
      for (const [name, fg, bg] of pairs) {
        it(`${skin}/${mode} · ${name} clears ${AA}:1`, () => {
          const r = ratio(fg, bg)
          expect(r, `${skin}/${mode} ${name}: ${fg} on ${bg} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
        })
      }

      // Card marks composite over a dark scrim regardless of mode. The skin accent is painted only
      // where it clears AA — over a real cover (image, not measured) and over a DARK-mode placeholder;
      // over a LIGHT-mode placeholder it falls back to WHITE. Model each mode's real path:
      if (mode === 'dark') {
        it(`${skin}/dark · mark accent on the placeholder scrim clears ${AA}:1`, () => {
          // deepest scrim (placeholder) over the dark surface: rgba(0,0,0,.62) over card-solid
          const bg = scrim(t.cardSolid, 0.62)
          const r = ratio(t.markAccent, bg)
          expect(r, `mark accent ${t.markAccent} on ${bg} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
        })
      } else {
        it(`${skin}/light · white mark on the placeholder scrim clears ${AA}:1`, () => {
          const bg = scrim(t.cardSolid, 0.62)
          const r = ratio('#ffffff', bg)
          expect(r, `white mark on ${bg} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
        })
      }
    }
  }
})
