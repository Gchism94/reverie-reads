// Fetch the self-hosted webfonts — the provenance record and the only writer of
// apps/web/public/fonts/ (feat/selfhost-webfonts).
//
// WHAT IT MIRRORS, AND WHY BYTE-FIDELITY MATTERS. Each skin's font pairing used to load from
// fonts.googleapis.com via the css2 URLs below. glyphAllowlist.ts's tofu analysis is calibrated
// against exactly what those URLs serve: Google's per-subset woff2 instances, whose `unicode-range`
// descriptors stop around U+206F (plus four isolated math glyphs), so every symbol glyph in the app
// falls through to the OS. This script therefore downloads THE SAME css2 responses (Chrome UA →
// woff2 + unicode-range) and THE SAME woff2 files, rewriting only the `url(...)` to a local path —
// the glyph coverage the allowlist assumes is preserved because the bytes are Google's own.
// fontSubsetContract.test.ts guards that property against a future re-fetch drifting.
//
// RE-RUNNING. `node scripts/fetch-fonts.mjs` refreshes everything (font versions bump upstream).
// After a re-run: re-run the unit suite (the subset contract test), re-check NOTICES.md's font
// entries, and treat it as a rendering-layer change (surface-visual sweep + baseline recapture).
//
// LICENSING. All 19 families are SIL OFL 1.1 (verified against the google/fonts repo — every one
// lives under ofl/). OFL permits redistribution, bundled with software, provided the license and
// copyright notices ride along: NOTICES.md carries the per-family entries, and the OFL text ships
// at public/fonts/OFL.txt. The woff2 instances are Google's mechanical subsets of the upstream
// fonts (their modification, served by them under the same license); we redistribute them
// unmodified, so no Reserved Font Name is exercised.

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FONTS_DIR = join(HERE, '..', 'apps', 'web', 'public', 'fonts')
const FILES_DIR = join(FONTS_DIR, 'files')

// The upstream css2 URLs, verbatim from the pre-selfhost FONT_CSS map (src/skin/fonts.ts at
// 52c668a). This is the provenance record: the app no longer references these hosts anywhere.
const SOURCES = {
  brand:
    'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,500&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap',
  tryst:
    'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,500;1,9..144,600&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap',
  grimoire:
    'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Spectral:wght@400;500;600;700&display=swap',
  aphelion:
    'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap',
  marrow:
    'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Libre+Franklin:wght@400;500;600;700&display=swap',
  umbra:
    'https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap',
  folio:
    'https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Caveat:wght@400;600&display=swap',
  hearth:
    'https://fonts.googleapis.com/css2?family=Bitter:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Varela+Round&display=swap',
  almanac:
    'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=Archivo:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap',
  bloom:
    'https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;500;600;700&family=Karla:ital,wght@0,400;0,500;0,700;1,400;1,700&display=swap',
}

// A Chrome UA so css2 answers with woff2 sources + unicode-range subsets — the exact serving the
// allowlist was calibrated against. (Default curl UA gets legacy ttf with no subsetting.)
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

mkdirSync(FILES_DIR, { recursive: true })

/** gstatic path `/s/<family>/<version>/<hash>.woff2` → stable local name. */
function localName(gstaticUrl) {
  const m = gstaticUrl.match(/\/s\/([^/]+)\/([^/]+)\/([^/]+\.woff2)$/)
  if (!m) throw new Error(`unexpected gstatic url shape: ${gstaticUrl}`)
  return `${m[1]}-${m[2]}-${m[3]}`
}

const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7)
if (only && !Object.hasOwn(SOURCES, only)) throw new Error('Unknown font pairing')
const manifest = {}
let downloaded = 0
let reused = 0

for (const [skin, url] of Object.entries(SOURCES)) {
  if (only && skin !== only) continue
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`css2 ${skin}: HTTP ${res.status}`)
  let css = await res.text()

  const files = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1])
  for (const f of files) {
    const name = localName(f)
    const dest = join(FILES_DIR, name)
    if (!existsSync(dest)) {
      const r = await fetch(f, { headers: { 'User-Agent': UA } })
      if (!r.ok) throw new Error(`woff2 ${name}: HTTP ${r.status}`)
      writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
      downloaded++
    } else {
      reused++
    }
    css = css.replaceAll(`url(${f})`, `url(/fonts/files/${name})`)
  }

  // The upstream URL deliberately does NOT ride in the shipped file: SOURCES above is the
  // provenance record, and keeping the shipped bytes free of font-origin strings is what lets
  // assert-dist-clean.mjs grep the BUILT OUTPUT for them with zero exceptions.
  const header =
    `/* Self-hosted mirror of Google Fonts css2 for the ${skin} skin.\n` +
    ` * Upstream source URL: recorded in scripts/fetch-fonts.mjs (SOURCES), the only writer\n` +
    ` * of this file. Kept out of the shipped bytes so the built-output guard can assert ZERO\n` +
    ` * font-origin strings ship (apps/web/scripts/assert-dist-clean.mjs).\n` +
    ` * Regenerate with \`node scripts/fetch-fonts.mjs\`.\n` +
    ` * Subsetting and unicode-range are Google's own, unmodified — glyphAllowlist.ts depends on\n` +
    ` * that (see fontSubsetContract.test.ts). Licenses: SIL OFL 1.1 (NOTICES.md, OFL.txt). */\n`
  writeFileSync(join(FONTS_DIR, `${skin}.css`), header + css)
  console.log(`${skin}.css written (${files.length} font refs)`)
}

// Count the shipped references, including untouched pairings during a selective refresh.
// Starting from the old totals would inflate shared-family counts every time --only is repeated.
for (const pairing of Object.keys(SOURCES)) {
  const css = readFileSync(join(FONTS_DIR, `${pairing}.css`), 'utf8')
  for (const match of css.matchAll(/url\(\/fonts\/files\/([^-]+)-(v\d+)-[^)]+\)/g)) {
    const [, family, version] = match
    manifest[family] ??= { version, files: 0 }
    manifest[family].files++
  }
}
writeFileSync(join(FONTS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`done: ${downloaded} woff2 downloaded, ${reused} reused across skins`)
