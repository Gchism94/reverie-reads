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
  'grimoire/dark': { bg0: '#0c0f0b', cardSolid: '#161b12', ink: '#ece7d6', muted: '#9aa384', accentFill: '#2f9e74', onPrimary: '#08110b', accentInk: '#d4af37', markAccent: '#d4af37' },
  'grimoire/light': { bg0: '#f1e7cf', cardSolid: '#f7efd9', ink: '#2a2418', muted: '#665e49', accentFill: '#1a6e4c', onPrimary: '#ffffff', accentInk: '#6e5518', markAccent: '#b08828' },
  'aphelion/dark': { bg0: '#05070d', cardSolid: '#0d1320', ink: '#e6edf7', muted: '#7d8aa6', accentFill: '#1f8fa3', onPrimary: '#02080a', accentInk: '#4fd1e0', markAccent: '#4fd1e0' },
  'aphelion/light': { bg0: '#eef3fb', cardSolid: '#f7fafe', ink: '#0e1626', muted: '#51607a', accentFill: '#0a6e80', onPrimary: '#ffffff', accentInk: '#0a6e80', markAccent: '#0a6e80' },
  'marrow/dark': { bg0: '#0a0a0b', cardSolid: '#161315', ink: '#e8e3da', muted: '#98907f', accentFill: '#8f3535', onPrimary: '#ffffff', accentInk: '#d06a6a', markAccent: '#d06a6a' },
  'marrow/light': { bg0: '#ece8e0', cardSolid: '#f4f0e8', ink: '#1b1815', muted: '#6a6358', accentFill: '#8a3232', onPrimary: '#ffffff', accentInk: '#8a3232', markAccent: '#8a3232' },
  'umbra/dark': { bg0: '#0c0d10', cardSolid: '#15171c', ink: '#e9eaed', muted: '#9398a3', accentFill: '#7e5a16', onPrimary: '#ffffff', accentInk: '#e0a84a', markAccent: '#e0a84a' },
  'umbra/light': { bg0: '#eceef1', cardSolid: '#f8f9fb', ink: '#14161a', muted: '#565c66', accentFill: '#7e5a16', onPrimary: '#ffffff', accentInk: '#7e5a16', markAccent: '#8a6412' },
  'folio/dark': { bg0: '#1a1916', cardSolid: '#211f1a', ink: '#ece7dc', muted: '#989182', accentFill: '#34435a', onPrimary: '#ffffff', accentInk: '#8aa0c0', markAccent: '#8aa0c0' },
  'folio/light': { bg0: '#f4f1ea', cardSolid: '#faf8f2', ink: '#1f1d1a', muted: '#645f56', accentFill: '#34435a', onPrimary: '#ffffff', accentInk: '#34435a', markAccent: '#3a4a63' },
  'hearth/dark': { bg0: '#1d1812', cardSolid: '#251f16', ink: '#efe6d6', muted: '#b3a488', accentFill: '#a85f33', onPrimary: '#ffffff', accentInk: '#d8945e', markAccent: '#d8945e' },
  'hearth/light': { bg0: '#f6efe2', cardSolid: '#fbf6ec', ink: '#3a2f25', muted: '#70624e', accentFill: '#97532a', onPrimary: '#ffffff', accentInk: '#8a4d28', markAccent: '#97532a' },
  'almanac/dark': { bg0: '#101316', cardSolid: '#161a1e', ink: '#e6e8ea', muted: '#878e98', accentFill: '#235456', onPrimary: '#ffffff', accentInk: '#4fa0a3', markAccent: '#4fa0a3' },
  'almanac/light': { bg0: '#f2f1ec', cardSolid: '#faf9f5', ink: '#22252a', muted: '#616771', accentFill: '#235456', onPrimary: '#ffffff', accentInk: '#235456', markAccent: '#2c6b6e' },
  'bloom/dark': { bg0: '#16111f', cardSolid: '#1e1730', ink: '#f1ecfb', muted: '#a99fc4', accentFill: '#6a3fd0', onPrimary: '#ffffff', accentInk: '#b794ff', markAccent: '#b794ff' },
  'bloom/light': { bg0: '#fbf4fd', cardSolid: '#fefbff', ink: '#221b2e', muted: '#635c85', accentFill: '#6a2fd0', onPrimary: '#ffffff', accentInk: '#6a2fd0', markAccent: '#7c3aed' },
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
        // 1c — typed text in a search / input field. --field = a 5% ink wash over the bg; model it.
        ['input/search text on field', t.ink, mixSrgb(t.ink, t.bg0, 0.05)],
        // structural — section-header readout + accent status-tag text sit in --accent-ink on the page bg.
        ['structural readout / accent tag (accent-ink) on bg', t.accentInk, t.bg0],
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
