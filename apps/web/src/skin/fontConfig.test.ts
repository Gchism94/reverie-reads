import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SKINS, type SkinId } from '@reverie/core'
import { FONT_CSS } from './fonts'

// The font-config guards, moved OFF the network (fix/font-specs-deterministic).
//
// What these replace, and why the replacement is stronger:
//
// `e2e/fonts.spec.ts` used to hold a hand-maintained list of 18 families and assert each one
// resolved via `document.fonts.check()` after a real visit to /skins. That assertion could only
// fail for one of two reasons — a genuine config drift, or Google Fonts being slow/down — and it
// could not tell them apart. Since `e2e` is a required check, the second reason blocked every
// merge in the repo. The intent behind it was real, though, and it is preserved here: the 18-family
// list encoded "every family a designed skin depends on is actually requested", which is a
// CONFIG-DRIFT question, answerable from the source with no browser and no network at all.
//
// Three duplications exist in the font setup, each protected today only by a code comment asking
// the next person to keep things in sync:
//   1. index.html's pre-paint boot map ⟷ src/skin/fonts.ts FONT_CSS   (index.html: "Keep this map
//      in sync with src/skin/fonts.ts")
//   2. each skin's FONT_CSS URL ⟷ the families that skin's own tokens name in --font-display /
//      --font-body (tokens.css)
//   3. the preconnect hints ⟷ the host the URLs actually point at
// A comment is not a guard. These are.

const webRoot = join(__dirname, '../..')
const indexHtml = readFileSync(join(webRoot, 'index.html'), 'utf8')
const tokensCss = readFileSync(join(webRoot, 'src/styles/tokens.css'), 'utf8')

/**
 * The families a skin's SELF-HOSTED stylesheet actually declares. FONT_CSS now points at
 * public/fonts/<skin>.css (mirrored from Google's css2 by scripts/fetch-fonts.mjs), so the
 * families come from the shipped file's own @font-face blocks — the thing a reader's browser
 * parses — rather than from a URL's query string. Stronger than the css2-era parse: a URL could
 * request a family the CDN failed to serve; a font-family declaration in the shipped bytes cannot.
 */
function familiesIn(cssPath: string): string[] {
  const css = readFileSync(join(webRoot, 'public', cssPath), 'utf8')
  return [...new Set([...css.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]!))]
}

/** The boot script's FONT map, parsed out of index.html rather than duplicated here. */
function bootFontMap(): Record<string, string> {
  const block = indexHtml.match(/var FONT = \{([\s\S]*?)\n\s*\}/)
  expect(
    block,
    'index.html no longer contains a `var FONT = {…}` boot map — update this test',
  ).toBeTruthy()
  const out: Record<string, string> = {}
  for (const m of block![1]!.matchAll(/(\w+):\s*'([^']+)'/g)) out[m[1]!] = m[2]!
  return out
}

describe('font config — no drift between the places a typeface is declared', () => {
  const skinIds = Object.keys(SKINS) as SkinId[]

  it('every skin in the registry has a font pairing (a new skin fails until it does)', () => {
    for (const skin of skinIds) {
      expect(FONT_CSS[skin], `${skin} has no FONT_CSS entry`).toBeTruthy()
      expect(familiesIn(FONT_CSS[skin]).length, `${skin} requests no families`).toBeGreaterThan(0)
    }
  })

  // Duplication 1. The boot script cannot import the module (it runs pre-paint, before any bundle),
  // so the map is genuinely duplicated — which is exactly why it needs a test rather than a comment.
  it("index.html's pre-paint boot map matches src/skin/fonts.ts exactly", () => {
    const boot = bootFontMap()
    expect(Object.keys(boot).sort()).toEqual(skinIds.slice().sort())
    for (const skin of skinIds) {
      expect(boot[skin], `boot map URL for ${skin} differs from FONT_CSS`).toBe(FONT_CSS[skin])
    }
  })

  // Duplication 2. This is the assertion the deleted 18-family e2e list was really making — that a
  // skin whose tokens say "speak Fraunces" actually REQUESTS Fraunces — minus the network.
  it('each skin requests every family its own tokens name', () => {
    // `[data-skin='x']` blocks in tokens.css, each with its --font-display / --font-body values.
    const blocks = [...tokensCss.matchAll(/\[data-skin=['"](\w+)['"]\][^{]*\{([\s\S]*?)\n\}/g)]
    expect(blocks.length, 'no [data-skin=…] blocks parsed from tokens.css').toBeGreaterThan(0)

    const missing: string[] = []
    for (const [, skin, body] of blocks) {
      if (!skinIds.includes(skin as SkinId)) continue
      const requested = familiesIn(FONT_CSS[skin as SkinId]).map((f) => f.toLowerCase())
      // Quoted family names only — the unquoted tail of a stack is generic/system (Georgia,
      // ui-serif, system-ui), which is the FALLBACK and must never be requested from the CDN.
      for (const m of body!.matchAll(/--font-(?:display|body|hand):\s*([^;]+);/g)) {
        for (const q of m[1]!.matchAll(/'([^']+)'|"([^"]+)"/g)) {
          const fam = (q[1] ?? q[2])!.toLowerCase()
          if (fam.startsWith('var(')) continue
          if (!requested.includes(fam))
            missing.push(`${skin}: declares '${fam}' but never requests it`)
        }
      }
    }
    expect(missing, missing.join('\n')).toHaveLength(0)
  })

  // Duplication 3, inverted by self-hosting. The preconnect hints existed for the two Google
  // origins; with the fonts local there is no cross-origin round trip to warm, and a lingering
  // preconnect — or any font URL pointing back at a third-party host — would mean the GDPR
  // exposure the self-hosting removed has quietly returned. Asserted in both places a regression
  // could land: the boot markup and the FONT_CSS map.
  it('no font loading touches a third-party host — every pairing is a local /fonts/ stylesheet', () => {
    expect(indexHtml).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/)
    for (const skin of skinIds) {
      expect(FONT_CSS[skin], `${skin}'s pairing is not a local /fonts/ path`).toMatch(
        /^\/fonts\/[a-z]+\.css$/,
      )
    }
  })

  it('every @font-face ships font-display: swap — a FOIT would hide text while a face loads', () => {
    for (const skin of skinIds) {
      const css = readFileSync(join(webRoot, 'public', FONT_CSS[skin]), 'utf8')
      const faces = css.match(/@font-face/g)?.length ?? 0
      const swaps = css.match(/font-display:\s*swap/g)?.length ?? 0
      expect(faces, `${skin}.css declares no faces at all`).toBeGreaterThan(0)
      expect(swaps, `${skin}.css: ${faces} faces but ${swaps} font-display: swap`).toBe(faces)
    }
  })

  // The fallback is what a reader actually sees when the CDN is slow, blocked, or down. An empty or
  // webfont-only stack is the tofu risk; a generic keyword at the end is what makes it survivable.
  it('every --font-display / --font-body stack ends in a generic or system family', () => {
    const generics = [
      'serif',
      'sans-serif',
      'monospace',
      'cursive',
      'system-ui',
      'ui-serif',
      'ui-sans-serif',
      'ui-monospace',
      'ui-rounded',
    ]
    const bad: string[] = []
    for (const m of tokensCss.matchAll(/--font-(?:display|body):\s*([^;]+);/g)) {
      const stack = m[1]!.trim()
      if (stack.startsWith('var(')) continue
      const last = stack.split(',').pop()!.trim().replace(/['"]/g, '')
      if (!generics.includes(last)) bad.push(stack)
    }
    expect(bad, `stacks with no generic fallback:\n${bad.join('\n')}`).toHaveLength(0)
  })
})
