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

/** The `family=` parameters a Google Fonts css2 URL requests, decoded ('Libre+Franklin' → 'Libre Franklin'). */
function familiesIn(url: string): string[] {
  return [...url.matchAll(/family=([^:&]+)/g)].map((m) =>
    decodeURIComponent(m[1]!).replace(/\+/g, ' '),
  )
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

  // Duplication 3. A preconnect pointing at a host nothing loads from is dead weight; a missing one
  // costs a round trip on every cold load.
  it('preconnects cover exactly the hosts the font URLs use', () => {
    const hosts = new Set(Object.values(FONT_CSS).map((u) => new URL(u).origin))
    for (const host of hosts) {
      expect(indexHtml, `no preconnect for ${host}`).toContain(`rel="preconnect" href="${host}"`)
    }
    // gstatic serves the font BINARIES the css2 stylesheet points at — different origin, needs its
    // own (crossorigin) preconnect, and no URL in FONT_CSS names it, so it can't be derived above.
    expect(indexHtml).toContain('href="https://fonts.gstatic.com" crossorigin')
  })

  it('every font URL uses display=swap — a FOIT would hide text until the CDN answers', () => {
    for (const skin of skinIds) {
      expect(FONT_CSS[skin], `${skin} is missing display=swap`).toContain('display=swap')
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
