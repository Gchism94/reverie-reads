import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SKINS } from '@reverie/core'
import { WATCHED_RANGES } from '../lib/glyphAllowlist'

// THE SUBSET CONTRACT — glyphAllowlist.ts's calibration, enforced against the shipped bytes.
//
// The tofu analysis rests on one factual claim: the nine skins' webfonts are Latin subsets that
// stop around U+206F plus a few isolated glyphs, so every SYMBOL glyph in the app falls through
// to the OS and tofu risk is a platform question, not a per-skin one. While fonts loaded from
// Google that claim was verified against Google's `unicode-range` serving; now that the fonts are
// self-hosted (public/fonts, mirrored byte-faithfully by scripts/fetch-fonts.mjs), the claim is
// about files in THIS repo — so it gets a test that reads them, not a comment that remembers them.
//
// If a re-fetch (font version bumps) or a hand edit ever ships coverage into the symbol blocks the
// allowlist watches — Arrows beyond ↑↓, Math Operators beyond −∕, Misc Technical, Dingbats,
// Geometric Shapes beyond the combining-mark ◌, Braille, emoji — the analysis is invalidated and
// this fails, naming the range. That is the "naive self-hosting ships different glyph coverage
// than the analysis assumes" failure, made impossible to do silently.

const FONTS_DIR = join(__dirname, '../../public/fonts')

/** Codepoints the shipped subsets legitimately cover inside WATCHED_RANGES, measured at the
 *  moment of self-hosting (2026-08-19) and pinned. Everything here is prose/typography or an
 *  isolated glyph the allowlist already accounts for:
 *    U+2000–206F  General Punctuation — dashes, quotes, ellipsis; the PROSE_PUNCTUATION story
 *    U+20A0–20C0  Currency Symbols; U+20F0 combining asterisk (rides the combining-mark support)
 *    U+2113 ℓ, U+2116 № (Letterlike), U+2122 ™
 *    U+2191 ↑, U+2193 ↓, U+2212 −, U+2215 ∕ — the four isolated math/arrow glyphs the allowlist
 *    names as the known exceptions
 *    U+25CC ◌ — the dotted-circle combining-mark base, shipped by any font with mark support;
 *    not a chrome glyph this app uses
 */
const PINNED_ALLOWED: readonly [number, number][] = [
  [0x2000, 0x206f],
  [0x20a0, 0x20c0],
  [0x20f0, 0x20f0],
  [0x2113, 0x2113],
  [0x2116, 0x2116],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
  [0x25cc, 0x25cc],
]

const inAny = (cp: number, ranges: readonly [number, number][]) =>
  ranges.some(([a, b]) => cp >= a && cp <= b)

function coveredWatchedCodepoints(css: string): Set<number> {
  const out = new Set<number>()
  for (const m of css.matchAll(/unicode-range:\s*([^;]+);/g)) {
    for (const raw of m[1]!.split(',')) {
      const part = raw.trim().replace(/^U\+/i, '')
      // Wildcards (U+4??) never appear in Google's serving; fail loudly if one shows up rather
      // than mis-parsing it as hex.
      expect(
        part,
        `wildcard unicode-range "${raw.trim()}" — extend the parser deliberately`,
      ).not.toContain('?')
      const [a, b] = part.split('-')
      const lo = parseInt(a!, 16)
      const hi = b ? parseInt(b, 16) : lo
      for (let cp = lo; cp <= hi; cp++) if (inAny(cp, WATCHED_RANGES)) out.add(cp)
    }
  }
  return out
}

describe('self-hosted font subsets keep the coverage the glyph allowlist was calibrated on', () => {
  const skinIds = Object.keys(SKINS)

  it('every skin ships a stylesheet with real @font-face subsets', () => {
    const files = readdirSync(FONTS_DIR)
    for (const skin of skinIds) {
      expect(files, `public/fonts/${skin}.css is missing`).toContain(`${skin}.css`)
      const css = readFileSync(join(FONTS_DIR, `${skin}.css`), 'utf8')
      expect(
        css.match(/@font-face/g)?.length ?? 0,
        `${skin}.css has no @font-face`,
      ).toBeGreaterThan(0)
      // Every face is subset — a face with NO unicode-range would cover everything it carries,
      // which is exactly the uncalibrated state this contract exists to prevent.
      expect(
        css.match(/@font-face/g)!.length,
        `${skin}.css has @font-face blocks without unicode-range`,
      ).toBe(css.match(/unicode-range:/g)?.length ?? 0)
      // And the WHOLE FILE is free of font-origin strings — not merely the url() sources.
      // Provenance lives in scripts/fetch-fonts.mjs, deliberately not in the shipped bytes, so
      // this can be an exceptionless grep (assert-dist-clean.mjs makes the same claim of the
      // built output). Every url() must also resolve inside the mirror.
      expect(css, `${skin}.css ships a font-origin string`).not.toMatch(
        /fonts\.googleapis\.com|gstatic/,
      )
      for (const m of css.matchAll(/url\(([^)]+)\)/g)) {
        expect(m[1], `${skin}.css loads a font from outside the mirror`).toMatch(
          /^\/fonts\/files\//,
        )
      }
    }
  })

  it('no shipped subset covers a watched symbol block beyond the pinned, accounted-for set', () => {
    for (const skin of skinIds) {
      const css = readFileSync(join(FONTS_DIR, `${skin}.css`), 'utf8')
      const offending = [...coveredWatchedCodepoints(css)]
        .filter((cp) => !inAny(cp, PINNED_ALLOWED))
        .map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`)
      expect(
        offending,
        `${skin}.css ships coverage the glyph analysis does not account for — ` +
          `re-verify glyphAllowlist.ts's premise before extending PINNED_ALLOWED`,
      ).toEqual([])
    }
  })

  it('the latin subsets genuinely cover Latin — the contract is about symbols, not a font that lost its letters', () => {
    for (const skin of skinIds) {
      const css = readFileSync(join(FONTS_DIR, `${skin}.css`), 'utf8')
      expect(css, `${skin}.css has no latin block covering U+0000-00FF`).toMatch(
        /unicode-range:[^;]*U\+0000-00FF/,
      )
    }
  })
})
