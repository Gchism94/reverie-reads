import { describe, expect, it } from 'vitest'
import { contrastRatio, mixSrgb, parseColor } from './adaptive'
import { SKINS, type SkinId } from './skins'
import { FABLE5, SKIN_TOKENS, WHITE_MARK_IN_DARK } from './skinTokens.fixture'

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

// Token samples live in skinTokens.fixture.ts (shared with spineTint.contrast.test.ts) — a mirror of
// apps/web/src/styles/tokens.css, keyed off the SKINS registry.

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
        // trope chips (trope-system): present = ink on the chip wash; pinned = on-primary on
        // accent fill with the bookmark ornament. Both states, every skin × mode.
        ['trope chip (present) on chip wash', t.ink, mixSrgb(t.ink, t.bg0, 0.08)],
        ['trope chip (pinned) on accent fill', t.onPrimary, t.accentFill],
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

      // Spine slot — Tryst (leather) + Aphelion (brushed) have a textured binding, but the title +
      // author/callsign sit CENTRED, over the opaque --card-solid base (the gradient's dark shifts live
      // at the spine edges, away from the type). So the spine text holds AA on card-solid, at the min
      // sizes (13px title / 9px author — normal text, the 4.5 floor applies). Plain-binding skins reuse
      // the card pairs above.
      if (skin === 'tryst' || skin === 'aphelion') {
        const base = t.cardSolid
        const spinePairs: [string, string, string][] = [
          ['spine title on binding', skin === 'aphelion' ? t.ink : t.accentInk, base],
          ['spine author (muted) on binding', t.muted, base],
          ['spine callsign / label (accent-ink) on binding', t.accentInk, base],
        ]
        for (const [name, fg, bg] of spinePairs) {
          it(`${skin}/${mode} · ${name} clears ${AA}:1`, () => {
            const r = ratio(fg, bg)
            expect(r, `${skin}/${mode} ${name}: ${fg} on ${bg} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
          })
        }
      }

      // Fable 5 designed surfaces (only present for the refined/designed skins)
      const f5 = FABLE5[`${skin}/${mode}`]
      if (f5) {
        const f5pairs: [string, string, string][] = [
          ['CTA text on the CTA card', f5.ctaInk, mixSrgb(f5.ctaHi, f5.ctaLo, 0.5)],
          ['spine title on the binding (mid)', f5.spineTitle, mixSrgb(f5.spineLo, f5.spineHi, 0.5)],
          ['spine author on the binding (mid)', f5.spineMuted, mixSrgb(f5.spineLo, f5.spineHi, 0.5)],
          ...f5.phStops.map((stop, i): [string, string, string] => [
            `placeholder title on board stop ${i}`, f5.phInk, stop,
          ]),
          ...f5.phStops.map((stop, i): [string, string, string] => [
            `placeholder author on board stop ${i}`, mixSrgb(f5.phMutedInk, stop, f5.phMutedAlpha), stop,
          ]),
        ]
        for (const [name, fg, bg] of f5pairs) {
          it(`${skin}/${mode} · ${name} clears ${AA}:1`, () => {
            const r = ratio(fg, bg)
            expect(r, `${skin}/${mode} ${name}: ${fg} on ${bg} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
          })
        }
      }

      // Card marks composite over a dark scrim regardless of mode. The skin accent is painted only
      // where it clears AA — over a real cover (image, not measured) and over a DARK-mode placeholder;
      // over a LIGHT-mode placeholder it falls back to WHITE. Model each mode's real path:
      if (mode === 'dark') {
        it(`${skin}/dark · mark ink on the placeholder scrim clears ${AA}:1`, () => {
          // deepest scrim (placeholder) over the dark surface: rgba(0,0,0,.62) over card-solid.
          // Non-inverting skins keep light placeholders at night → the app paints white there.
          const bg = scrim(t.cardSolid, 0.62)
          const ink = WHITE_MARK_IN_DARK.has(skin) ? '#ffffff' : t.markAccent
          const r = ratio(ink, bg)
          expect(r, `mark ink ${ink} on ${bg} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
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
