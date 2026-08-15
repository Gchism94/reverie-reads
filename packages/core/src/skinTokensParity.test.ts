import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SKINS, type SkinId } from './skins'
import { SKIN_TOKENS } from './skinTokens.fixture'

// skinTokens.fixture.ts ↔ tokens.css parity.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
// The fixture's own header calls it "a mirror of the values in apps/web/src/styles/tokens.css".
// A hand-maintained mirror is a duplicate nothing keeps in sync, and it had already drifted: four
// combos recorded a --card-solid that no longer matched the stylesheet, so every contrast guard
// keyed off it was measuring a surface the app does not paint. Direction of error was favourable
// (the real surfaces gave MORE contrast), which is exactly why nothing noticed — a drift the other
// way would leave the suite green while real text failed AA.
//
// ── WHY PARITY AND NOT DERIVATION ───────────────────────────────────────────────────────────────
// The obvious fix — delete --card-solid and compute it as --card over --bg — is WRONG here, and the
// evidence is in the history rather than the values. --card-solid started life as exactly that
// alias (tokens.css still declares `--card-solid: var(--card)` as the base default, and 15 of 18
// combos still satisfy it exactly). But `e01e89c` ("Fable 5 chunk 2 — Grimoire, Marrow, Gaslight
// get their bone") deliberately lifted it away from --card for marrow/dark, umbra/light and
// umbra/dark — and an earlier commit (`880bc33`) had previously set marrow/dark's --card-solid to
// MATCH --card, so the divergence is a considered reversal, not an oversight. Deriving would
// silently revert a design decision.
//
// The token has outgrown its name: --card-solid is now the PLATE / modal / spine surface, which is
// why --plate, --spine-lo, --spine-hi and --sky all alias it. It is a real independent token, so
// the duplication that needs killing is not --card-solid itself but the fixture's hand-copy of it.
// This test is that kill: the fixture may exist (the contrast tests need plain values to do colour
// maths on), but it may not disagree with the stylesheet.

const CSS_ROOT = join(__dirname, '../../../apps/web/src/styles')
const css = readFileSync(join(CSS_ROOT, 'tokens.css'), 'utf8')
const brand = readFileSync(join(CSS_ROOT, 'brand.css'), 'utf8')

type Block = { sel: string; decls: Record<string, string> }

function parseBlocks(text: string): Block[] {
  const out: Block[] = []
  // Comments can contain braces and would otherwise be captured into the selector.
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls: Record<string, string> = {}
    for (const d of m[2]!.split(';')) {
      const i = d.indexOf(':')
      if (i < 0) continue
      const k = d.slice(0, i).trim()
      if (k.startsWith('--')) decls[k] = d.slice(i + 1).trim()
    }
    if (Object.keys(decls).length) out.push({ sel: m[1]!.trim().replace(/\s+/g, ' '), decls })
  }
  return out
}

const ALL = [...parseBlocks(brand), ...parseBlocks(css)]

/** Cascade in specificity order: base → [data-skin='x'] → [data-skin='x'][data-mode='m']. */
function tokensFor(skin: SkinId, mode: 'light' | 'dark'): Record<string, string> {
  const layers: ((s: string) => boolean)[] = [
    (s) => /(^|,)\s*(:root|html|\*|\[data-skin\])\s*$/.test(s),
    (s) => s.includes(`[data-skin='${skin}']`) && !s.includes('data-mode'),
    (s) => s.includes(`[data-skin='${skin}']`) && s.includes(`[data-mode='${mode}']`),
  ]
  const map: Record<string, string> = {}
  for (const match of layers) for (const b of ALL) if (match(b.sel)) Object.assign(map, b.decls)
  return map
}

function resolve(
  map: Record<string, string>,
  value: string | undefined,
  depth = 0,
): string | undefined {
  if (value == null || depth > 12) return value
  const m = value.trim().match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/)
  if (!m) return value.trim()
  const next = map[m[1]!]
  if (next !== undefined) return resolve(map, next, depth + 1)
  return m[2] ? resolve(map, m[2], depth + 1) : value.trim()
}

const norm = (c: string): string => {
  let h = c.trim().toLowerCase()
  const m = h.match(/^#([0-9a-f]{3})$/)
  if (m)
    h =
      '#' +
      m[1]!
        .split('')
        .map((x) => x + x)
        .join('')
  return h
}

describe('skinTokens.fixture ↔ tokens.css parity (every skin × mode)', () => {
  // Only the fields that are a DIRECT copy of a single custom property. Composited fields
  // (fieldOnCard, pickRing) are computed values with their own documented derivations, not copies,
  // so they are out of scope here — they need their own derivation test, not a parity one.
  const DIRECT: [keyof (typeof SKIN_TOKENS)['tryst/dark'], string][] = [
    ['bg0', '--bg0'],
    ['cardSolid', '--card-solid'],
    // Added with the card-surface guards (Track A PR 1). Both are pinned here rather than
    // pre-composited into the fixture precisely so this test can hold them to tokens.css — the
    // composite is done by the consumer. `--line` is rgba in all 18 combos and `--card` in tryst,
    // so a drift in either is invisible to any assertion that reads only opaque values.
    ['card', '--card'],
    // --line is pinned here for the card-surface border guard. marrow/dark's value moved in
    // Track A PR 2 (alpha 0.2 -> 0.45); this test is what makes that a one-place change rather
    // than a fixture that can silently disagree with the stylesheet it claims to mirror.
    ['line', '--line'],
    ['ink', '--ink'],
    ['muted', '--muted'],
    ['accentFill', '--accent-fill'],
    ['onPrimary', '--on-primary'],
    ['accentInk', '--accent-ink'],
  ]

  for (const skin of Object.keys(SKINS) as SkinId[]) {
    for (const mode of ['light', 'dark'] as const) {
      const key = `${skin}/${mode}` as const
      const map = tokensFor(skin, mode)

      for (const [field, prop] of DIRECT) {
        it(`${key} · ${field} matches ${prop}`, () => {
          const live = resolve(map, map[prop])
          expect(live, `${prop} is not defined for ${key} in tokens.css`).toBeDefined()
          expect(
            norm(SKIN_TOKENS[key][field] as string),
            `${key}: fixture ${field}=${SKIN_TOKENS[key][field]} but tokens.css ${prop}=${live}. ` +
              `The fixture is a mirror — update it, or fix the stylesheet; do not let them disagree.`,
          ).toBe(norm(live!))
        })
      }
    }
  }
})
