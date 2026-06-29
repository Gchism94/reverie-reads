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
  'tryst/dark': { ink: '#f6e9f1', cardSolid: '#1c0d28', '--accent-fill': '#cf2f66', '--violet': '#7b3fa0', '--blue': '#16266a', '--gold': '#f0b14e' },
  'tryst/light': { ink: '#2a1320', cardSolid: '#fff8f5', '--accent-fill': '#c52e5f', '--violet': '#7b3fa0', '--blue': '#2e3a73', '--gold': '#c9842f' },
  'grimoire/dark': { ink: '#ece7d6', cardSolid: '#161b12', '--accent-fill': '#2f9e74', '--violet': '#b08828', '--blue': '#1f7d57', '--gold': '#d4af37' },
  'grimoire/light': { ink: '#2a2418', cardSolid: '#f7efd9', '--accent-fill': '#1a6e4c', '--violet': '#8a6a2f', '--blue': '#1f7d57', '--gold': '#b08828' },
  'aphelion/dark': { ink: '#e6edf7', cardSolid: '#0d1320', '--accent-fill': '#1f8fa3', '--violet': '#6b8cff', '--blue': '#3a52c4', '--gold': '#b9c7e0' },
  'aphelion/light': { ink: '#0e1626', cardSolid: '#f7fafe', '--accent-fill': '#0a6e80', '--violet': '#3a52c4', '--blue': '#3a52c4', '--gold': '#5a6b86' },
  'marrow/dark': { ink: '#e8e3da', cardSolid: '#161315', '--accent-fill': '#8f3535', '--violet': '#6f7d86', '--blue': '#56616b', '--gold': '#8c9a3c' },
  'marrow/light': { ink: '#1b1815', cardSolid: '#f4f0e8', '--accent-fill': '#8a3232', '--violet': '#56616b', '--blue': '#56616b', '--gold': '#6f7a2e' },
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
