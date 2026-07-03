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
  'tryst/dark': { bg0: '#0b0612', cardSolid: '#1d0e29', ink: '#f5e9f0', muted: '#c2a3bd', accentFill: '#a3244a', onPrimary: '#ffffff', accentInk: '#f0b14e', markAccent: '#f0b14e' },
  'tryst/light': { bg0: '#f8eee4', cardSolid: '#fdf8f1', ink: '#351523', muted: '#7d556b', accentFill: '#9c2246', onPrimary: '#ffffff', accentInk: '#8a5717', markAccent: '#8a5717' },
  'grimoire/dark': { bg0: '#0c0f0b', cardSolid: '#161b12', ink: '#ece7d6', muted: '#a8b08c', accentFill: '#3aa97e', onPrimary: '#08110b', accentInk: '#d4af37', markAccent: '#d4af37' },
  'grimoire/light': { bg0: '#f1e7cf', cardSolid: '#f7efd9', ink: '#2a2418', muted: '#6b644e', accentFill: '#1f7d57', onPrimary: '#ffffff', accentInk: '#6e5518', markAccent: '#8a6a2f' },
  'aphelion/dark': { bg0: '#05070d', cardSolid: '#0c1220', ink: '#e6edf7', muted: '#8595b4', accentFill: '#1f8fa3', onPrimary: '#02080a', accentInk: '#4fd1e0', markAccent: '#4fd1e0' },
  'aphelion/light': { bg0: '#eef3fb', cardSolid: '#f7fafe', ink: '#0e1626', muted: '#51607a', accentFill: '#0a6e80', onPrimary: '#ffffff', accentInk: '#0a6e80', markAccent: '#0a6e80' },
  'marrow/dark': { bg0: '#17181c', cardSolid: '#212328', ink: '#e9e4db', muted: '#a8a39a', accentFill: '#a84545', onPrimary: '#ffffff', accentInk: '#d67878', markAccent: '#d67878' },
  'marrow/light': { bg0: '#ece8e0', cardSolid: '#f4f0e8', ink: '#1b1815', muted: '#6a6358', accentFill: '#8a3232', onPrimary: '#ffffff', accentInk: '#8a3232', markAccent: '#8a3232' },
  'umbra/dark': { bg0: '#101216', cardSolid: '#191c22', ink: '#e8e4da', muted: '#99a3ad', accentFill: '#d9a441', onPrimary: '#23201a', accentInk: '#d9a441', markAccent: '#d9a441' },
  'umbra/light': { bg0: '#edeae2', cardSolid: '#f6f4ee', ink: '#23201a', muted: '#5b656f', accentFill: '#8a6a1f', onPrimary: '#fbf6e8', accentInk: '#7a5d1b', markAccent: '#8a6a1f' },
  'folio/dark': { bg0: '#1a1916', cardSolid: '#211f1a', ink: '#ece7dc', muted: '#989182', accentFill: '#34435a', onPrimary: '#ffffff', accentInk: '#8aa0c0', markAccent: '#8aa0c0' },
  'folio/light': { bg0: '#f4f1ea', cardSolid: '#faf8f2', ink: '#1f1d1a', muted: '#645f56', accentFill: '#34435a', onPrimary: '#ffffff', accentInk: '#34435a', markAccent: '#3a4a63' },
  'hearth/dark': { bg0: '#1d1812', cardSolid: '#251f16', ink: '#efe6d6', muted: '#b3a488', accentFill: '#a85f33', onPrimary: '#ffffff', accentInk: '#d8945e', markAccent: '#d8945e' },
  'hearth/light': { bg0: '#f6efe2', cardSolid: '#fbf6ec', ink: '#3a2f25', muted: '#70624e', accentFill: '#97532a', onPrimary: '#ffffff', accentInk: '#8a4d28', markAccent: '#97532a' },
  'almanac/dark': { bg0: '#101316', cardSolid: '#161a1e', ink: '#e6e8ea', muted: '#878e98', accentFill: '#235456', onPrimary: '#ffffff', accentInk: '#4fa0a3', markAccent: '#4fa0a3' },
  'almanac/light': { bg0: '#f2f1ec', cardSolid: '#faf9f5', ink: '#22252a', muted: '#616771', accentFill: '#235456', onPrimary: '#ffffff', accentInk: '#235456', markAccent: '#2c6b6e' },
  'bloom/dark': { bg0: '#16111f', cardSolid: '#1e1730', ink: '#f1ecfb', muted: '#a99fc4', accentFill: '#6a3fd0', onPrimary: '#ffffff', accentInk: '#b794ff', markAccent: '#b794ff' },
  'bloom/light': { bg0: '#fbf4fd', cardSolid: '#fefbff', ink: '#221b2e', muted: '#635c85', accentFill: '#6a2fd0', onPrimary: '#ffffff', accentInk: '#6a2fd0', markAccent: '#7c3aed' },
}

/** Fable 5 material surfaces (chunk 1): CTA text on its card, spine type on the binding (title sits
 *  centred, so it's tested on the gradient's mid), placeholder type on each board stop (it floats
 *  across the whole plate). Alpha inks are composited over the surface before measuring. */
type Fable5 = {
  ctaInk: string
  ctaHi: string
  ctaLo: string
  spineTitle: string
  spineMuted: string
  spineLo: string
  spineHi: string
  phInk: string
  phMutedInk: string
  phMutedAlpha: number
  phStops: [string, string, string]
}
const FABLE5: Partial<Record<`${SkinId}/${'dark' | 'light'}`, Fable5>> = {
  'tryst/dark': {
    ctaInk: '#5a1f38', ctaHi: '#f7eede', ctaLo: '#e9d7bc',
    spineTitle: '#f0b14e', spineMuted: '#caa9c4', spineLo: '#1f0a18', spineHi: '#3c1428',
    phInk: '#ffeede', phMutedInk: '#ffdec8', phMutedAlpha: 0.78, phStops: ['#2a1030', '#4a163a', '#200c1e'],
  },
  'tryst/light': {
    ctaInk: '#fff4ea', ctaHi: '#ae2b52', ctaLo: '#8e1f42',
    spineTitle: '#6c4313', spineMuted: '#60394b', spineLo: '#d8a6b4', spineHi: '#ecccd4',
    phInk: '#3a1626', phMutedInk: '#6b4459', phMutedAlpha: 1, phStops: ['#f3e2d8', '#e8cbc9', '#eed7cc'],
  },
  'aphelion/dark': {
    ctaInk: '#02080a', ctaHi: '#6fdfec', ctaLo: '#3ec2d2',
    spineTitle: '#e6edf7', spineMuted: '#8595b4', spineLo: '#0a1220', spineHi: '#1a2a42',
    phInk: '#dff4fb', phMutedInk: '#bdf3fa', phMutedAlpha: 0.72, phStops: ['#0a1530', '#142a52', '#08111f'],
  },
  'aphelion/light': {
    ctaInk: '#f2fbfd', ctaHi: '#0d8093', ctaLo: '#0a6e80',
    spineTitle: '#0e1626', spineMuted: '#4d5d73', spineLo: '#c8d6e6', spineHi: '#e9f0f8',
    phInk: '#0e1626', phMutedInk: '#51607a', phMutedAlpha: 1, phStops: ['#e8f0f9', '#cfdded', '#dfe9f4'],
  },
  'grimoire/dark': {
    ctaInk: '#241f10', ctaHi: '#e7c95c', ctaLo: '#c9a22e',
    spineTitle: '#d4af37', spineMuted: '#b3ab8a', spineLo: '#3a3320', spineHi: '#292416',
    phInk: '#f0ead6', phMutedInk: '#e6dcbe', phMutedAlpha: 0.75, phStops: ['#2e2a18', '#3d3520', '#241f10'],
  },
  'grimoire/light': {
    ctaInk: '#f6ecd2', ctaHi: '#8a6a2f', ctaLo: '#6e5420',
    spineTitle: '#7a5c14', spineMuted: '#5e5742', spineLo: '#e6d7b2', spineHi: '#f0e3c4',
    phInk: '#3a3018', phMutedInk: '#5e5742', phMutedAlpha: 1, phStops: ['#f3e8ca', '#e9dab4', '#efe2c0'],
  },
  'marrow/dark': {
    ctaInk: '#241d18', ctaHi: '#f2ead9', ctaLo: '#d8cfba',
    spineTitle: '#e9e4db', spineMuted: '#a8a39a', spineLo: '#26282e', spineHi: '#1b1d21',
    phInk: '#e9e4db', phMutedInk: '#a8a39a', phMutedAlpha: 1, phStops: ['#24262c', '#1b1d21', '#212328'],
  },
  'marrow/light': {
    ctaInk: '#f4f0e8', ctaHi: '#3a3d44', ctaLo: '#26282e',
    spineTitle: '#2a251e', spineMuted: '#52483e', spineLo: '#c6bfae', spineHi: '#d5cfc0',
    phInk: '#2a251e', phMutedInk: '#52483e', phMutedAlpha: 1, phStops: ['#d8d2c4', '#c9c2b2', '#d2cbbc'],
  },
  'umbra/dark': {
    ctaInk: '#2a2214', ctaHi: '#e8bc5a', ctaLo: '#c1902f',
    spineTitle: '#2a251c', spineMuted: '#5d574a', spineLo: '#e2d9c2', spineHi: '#e2d9c2',
    phInk: '#e8e4da', phMutedInk: '#99a3ad', phMutedAlpha: 1, phStops: ['#2a2f38', '#1c2028', '#242932'],
  },
  'umbra/light': {
    ctaInk: '#f6f0dc', ctaHi: '#8a6a1f', ctaLo: '#6e5518',
    spineTitle: '#2a251c', spineMuted: '#5d574a', spineLo: '#f8f2e2', spineHi: '#f8f2e2',
    phInk: '#23201a', phMutedInk: '#3e474f', phMutedAlpha: 1, phStops: ['#d6d0c0', '#c5bfae', '#cfc9b9'],
  },
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
