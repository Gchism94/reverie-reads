import { describe, expect, it } from 'vitest'
import { contrastRatio, mixSrgb, parseColor } from './adaptive'
import { SKINS, type SkinId } from './skins'
import { FABLE5 } from './skinTokens.fixture'
import { tintedSpineColors } from './spineTint'

// Spine-tint guardrail — registry-keyed like skinCharacter.contrast.test.ts: for EVERY skin × mode
// with a recorded spine surface, a per-book cover tint must never sink the spine title or author
// below AA on the tinted gradient midpoint (the surface the base spine test measures). The clamp is
// allowed to weaken the tint or reject it outright (null → the skin default, tested green above);
// what it may never do is return a combination that violates AA. A palette of real-world cover
// colours (saturated hues, near-black jackets, cream boards, pastels) sweeps the input space.

const AA = 4.5
const TINTS = [
  '#e74c3c',
  '#c0392b', // reds
  '#3498db',
  '#1b4f72', // blues
  '#2ecc71',
  '#145a32', // greens
  '#f5e642',
  '#f39c12', // yellow/orange
  '#8e44ad',
  '#4a235a', // purples
  '#e8b4c8',
  '#f7ecd9', // pastels / cream boards
  '#111111',
  '#f8f8f8', // near-black jacket, near-white jacket
  '#7f8c8d', // mid gray (the hostile case — must clamp or reject)
]
const MODES = ['dark', 'light'] as const

describe('spine tint contrast (tinted binding keeps spine text ≥ AA, every skin × mode × tint)', () => {
  for (const skin of Object.keys(SKINS) as SkinId[]) {
    for (const mode of MODES) {
      const f5 = FABLE5[`${skin}/${mode}`]
      it(`${skin}/${mode} has a spine surface recorded`, () => {
        expect(f5, `add a FABLE5 row (spine surface) for ${skin}/${mode}`).toBeDefined()
      })
      if (!f5) continue
      const tokens = { title: f5.spineTitle, muted: f5.spineMuted, lo: f5.spineLo, hi: f5.spineHi }

      for (const tint of TINTS) {
        it(`${skin}/${mode} · tint ${tint} clamps to AA or falls back`, () => {
          const t = tintedSpineColors(tint, tokens)
          if (!t) return // rejected → the untinted skin default, already proven AA
          const mid = parseColor(mixSrgb(t.lo, t.hi, 0.5))!
          const rTitle = contrastRatio(parseColor(f5.spineTitle)!, mid)
          const rMuted = contrastRatio(parseColor(f5.spineMuted)!, mid)
          expect(
            rTitle,
            `title on tinted mid = ${rTitle.toFixed(2)}:1 (mix ${t.mix})`,
          ).toBeGreaterThanOrEqual(AA)
          expect(
            rMuted,
            `author on tinted mid = ${rMuted.toFixed(2)}:1 (mix ${t.mix})`,
          ).toBeGreaterThanOrEqual(AA)
        })
      }
    }
  }
})
