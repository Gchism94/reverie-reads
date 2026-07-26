import { describe, expect, it } from 'vitest'
import { contrastRatio, parseColor } from './adaptive'
import { PLACEHOLDER_ACCENTS, resolvePlaceholderColors, type PlaceholderAccent } from './coverPlaceholder'
import { SKINS, type SkinId } from './skins'

// Guardrail for Cover Studio pillar #3: the no-cover placeholder must clear WCAG AA at EVERY skin ×
// mode × accent. A 2-min axe e2e once caught this (the old recipe landed as low as 1.0:1 in light
// modes); this turns it into an instant, exhaustive unit catch and — because it's keyed off the SKINS
// registry — fails loudly the moment a new skin is added without its tokens recorded here, so a future
// skin can never reach the sweep red again.
//
// SKIN_TOKENS mirrors apps/web/src/styles/tokens.css (the render-time source of truth). `cardSolid` is
// the OPAQUE `--card-solid` (= `--card` where a skin doesn't override it), which is what the placeholder
// paints over. When you add or retune a skin in tokens.css, update the matching row below.

const AA_NORMAL = 4.5

type SkinTokens = { ink: string; cardSolid: string } & Record<PlaceholderAccent, string>

const SKIN_TOKENS: Record<`${SkinId}/${'dark' | 'light'}`, SkinTokens> = {
  'tryst/dark': { ink: '#f5e9f0', cardSolid: '#1d0e29', '--accent-fill': '#a3244a', '--violet': '#7b3fa0', '--blue': '#16266a', '--gold': '#f0b14e' },
  'tryst/light': { ink: '#351523', cardSolid: '#fdf8f1', '--accent-fill': '#9c2246', '--violet': '#7b3fa0', '--blue': '#2e3a73', '--gold': '#8a5717' },
  'grimoire/dark': { ink: '#ece7d6', cardSolid: '#161b12', '--accent-fill': '#3aa97e', '--violet': '#b08828', '--blue': '#1f7d57', '--gold': '#d4af37' },
  'grimoire/light': { ink: '#2a2418', cardSolid: '#f7efd9', '--accent-fill': '#1f7d57', '--violet': '#8a6a2f', '--blue': '#1f7d57', '--gold': '#b08828' },
  'aphelion/dark': { ink: '#e6edf7', cardSolid: '#0c1220', '--accent-fill': '#1f8fa3', '--violet': '#6b8cff', '--blue': '#3a52c4', '--gold': '#b9c7e0' },
  'aphelion/light': { ink: '#0e1626', cardSolid: '#f7fafe', '--accent-fill': '#0a6e80', '--violet': '#3a52c4', '--blue': '#3a52c4', '--gold': '#5a6b86' },
  'marrow/dark': { ink: '#e9e4db', cardSolid: '#212328', '--accent-fill': '#a84545', '--violet': '#6f7d86', '--blue': '#56616b', '--gold': '#8c9a3c' },
  'marrow/light': { ink: '#1b1815', cardSolid: '#f4f0e8', '--accent-fill': '#8a3232', '--violet': '#56616b', '--blue': '#56616b', '--gold': '#6f7a2e' },
  'umbra/dark': { ink: '#e8e4da', cardSolid: '#191c22', '--accent-fill': '#d9a441', '--violet': '#6b7785', '--blue': '#3f4a5a', '--gold': '#e0a84a' },
  'umbra/light': { ink: '#23201a', cardSolid: '#f6f4ee', '--accent-fill': '#8a6a1f', '--violet': '#5a6470', '--blue': '#3f4a5a', '--gold': '#8a6a1f' },
  // Fable 5 chunk 3 palettes — Marginalia (the page never inverts), Hearth (kitchen linen),
  // Almanac (buff + ink block), Firstlight (sky + sticker).
  'folio/dark': { ink: '#2b2820', cardSolid: '#d3cfc3', '--accent-fill': '#b1362b', '--violet': '#3f5a8a', '--blue': '#3f5a8a', '--gold': '#6b675e' },
  'folio/light': { ink: '#2b2820', cardSolid: '#f7f5ee', '--accent-fill': '#b1362b', '--violet': '#3f5a8a', '--blue': '#3f5a8a', '--gold': '#78736a' },
  'hearth/dark': { ink: '#f0e8d6', cardSolid: '#5c4829', '--accent-fill': '#b13a4e', '--violet': '#9aa878', '--blue': '#8a9968', '--gold': '#c9a86a' },
  'hearth/light': { ink: '#3d3226', cardSolid: '#dccca2', '--accent-fill': '#b13a4e', '--violet': '#6f7d4e', '--blue': '#5c7d6a', '--gold': '#8a6a3c' },
  'almanac/dark': { ink: '#e6ddc2', cardSolid: '#241f14', '--accent-fill': '#241f14', '--violet': '#cf6b26', '--blue': '#8a9968', '--gold': '#b3a67e' },
  'almanac/light': { ink: '#2b2820', cardSolid: '#eadfbe', '--accent-fill': '#2b2820', '--violet': '#c05e1e', '--blue': '#5c7d6a', '--gold': '#6f6552' },
  'bloom/dark': { ink: '#eef0fa', cardSolid: '#1f2240', '--accent-fill': '#6a55c9', '--violet': '#c06a5c', '--blue': '#262a4d', '--gold': '#f5b85a' },
  'bloom/light': { ink: '#2b2a3a', cardSolid: '#ffffff', '--accent-fill': '#6a55c9', '--violet': '#b86a5c', '--blue': '#6a55c9', '--gold': '#c9862e' },
}

const MODES = ['dark', 'light'] as const

describe('cover placeholder contrast (every skin × mode × accent ≥ AA)', () => {
  for (const skin of Object.keys(SKINS) as SkinId[]) {
    for (const mode of MODES) {
      const tokens = SKIN_TOKENS[`${skin}/${mode}`]

      it(`${skin}/${mode} has tokens recorded`, () => {
        // Anchored to the registry: a new skin with no row here fails here, not in the sweep.
        expect(tokens, `add a SKIN_TOKENS row for ${skin}/${mode} (see tokens.css)`).toBeDefined()
      })

      for (const accent of PLACEHOLDER_ACCENTS) {
        it(`${skin}/${mode} · ${accent} glyph clears ${AA_NORMAL}:1`, () => {
          const { background, color } = resolvePlaceholderColors({ accent: tokens[accent], ink: tokens.ink, cardSolid: tokens.cardSolid })
          const fg = parseColor(color)
          const bg = parseColor(background)
          expect(fg && bg).toBeTruthy()
          const ratio = contrastRatio(fg!, bg!)
          expect(ratio, `${skin}/${mode} ${accent}: ${color} on ${background} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL)
        })
      }
    }
  }
})

// The DESIGNED plates that paste a paper LABEL (box-lid, case-file, proof-sheet, linen-board,
// buff-manual, sky-mockup) don't use the `plain` recipe above — they set title and author in
// --paper-ink on --paper. That pair was never covered here, which is how marrow's box-lid reached
// the axe sweep. Values transcribed from tokens.css and verified against it.
//
// SCOPE, deliberately: only the six skins that actually define --paper. Tryst, Grimoire and
// Aphelion's plates (cloth-boards / vellum-boards / specimen-plate) set type in --ph-ink on the
// board gradient and carry no paper label, so a row for them would assert two colours that never
// meet. A full per-variant matrix is the next step and is NOT a naive token cross-product — bloom,
// for instance, puts its type on --paper over a --ph-* sky, so pairing --ph-ink with --ph-b there
// measures nothing that renders.
const PAPER_TOKENS: Record<string, { paper: string; paperInk: string }> = {
  'marrow/dark': { paper: '#ded6c6', paperInk: '#2a2620' },
  'marrow/light': { paper: '#f4efe3', paperInk: '#2a2620' },
  'umbra/dark': { paper: '#e2d9c2', paperInk: '#2a251c' },
  'umbra/light': { paper: '#f8f2e2', paperInk: '#2a251c' },
  'folio/dark': { paper: '#d3cfc3', paperInk: '#2b2820' },
  'folio/light': { paper: '#f7f5ee', paperInk: '#2b2820' },
  'hearth/dark': { paper: '#efe4cc', paperInk: '#3d3226' },
  'hearth/light': { paper: '#faf5ea', paperInk: '#3d3226' },
  'almanac/dark': { paper: '#efe6cc', paperInk: '#241f14' },
  'almanac/light': { paper: '#fbf6e8', paperInk: '#2b2820' },
  'bloom/dark': { paper: '#fbfbff', paperInk: '#2b2a3a' },
  'bloom/light': { paper: '#ffffff', paperInk: '#2b2a3a' },
}

describe('designed placeholder plates — the pasted paper label clears AA', () => {
  for (const [key, t] of Object.entries(PAPER_TOKENS)) {
    it(`${key} label type clears ${AA_NORMAL}:1 on its paper`, () => {
      const fg = parseColor(t.paperInk)
      const bg = parseColor(t.paper)
      expect(fg && bg).toBeTruthy()
      const ratio = contrastRatio(fg!, bg!)
      expect(ratio, `${key}: ${t.paperInk} on ${t.paper} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL)
    })
  }
})
