#!/usr/bin/env node
/**
 * Deploy guard: fail the build if the production bundle bakes a LOCAL Supabase/dev URL
 * (the launch registration failure — a 127.0.0.1 URL reaching reveriereads.app).
 *
 * Matches actual URL/port forms only — `https?://localhost`, `ws(s)://127.0.0.1`, `:54321/:55321` —
 * NOT bare hostname strings: the Sentry noise filter and vendored env checks legitimately compare
 * against "localhost"/"127.0.0.1" and must not trip this.
 *
 * Enforced on deploys/CI (VERCEL or CI env, or ENFORCE_DIST_CLEAN=1). A plain local `pnpm build`
 * only warns: .env.local intentionally bakes the local stack URL for the e2e/preview flows.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'

const DIST = new URL('../dist', import.meta.url).pathname
const SCAN_EXT = /\.(js|mjs|css|html|json|webmanifest|txt)$/
const PATTERNS = [
  /(https?|wss?):\/\/(localhost|127\.0\.0\.1)(:\d+)?/gi,
  /:5[45]321\b/g,
  // THIRD-PARTY CATALOG LEG (fix/client-google-legs): all three client-side Google Books fetches
  // were routed through Edge Functions, so the browser must never reach the volumes API and the
  // bundle must not carry a Books key. This asserts the GUARANTEE the PR makes — without it, the
  // property silently degrades the first time someone adds a fetch. Fonts (fonts.googleapis.com)
  // are a separate, deliberate leg and are NOT matched: this targets the books API and the key
  // name only. Ordinary vendor code has no reason to contain either string.
  /www\.googleapis\.com\/books/gi,
  /VITE_GOOGLE_BOOKS_KEY/g,
]

// Known-inert vendor fallback literals that ship inside every production bundle. Each is a default
// that our code always overrides with real config — never a leak of OUR environment:
//   - supabase-js bakes its GoTrue default `http://localhost:9999` (we always pass VITE_SUPABASE_URL)
//   - @sentry Spotlight's dev sidecar default `http://localhost:8969` (dev-only integration, dead in prod)
//   - @tanstack/router's portless `http://localhost` origin fallback (non-browser envs only)
// A real leak always carries a local Supabase form (127.0.0.1 / :54321 / :55321 / localhost:port)
// and none of those are allow-listed.
const ALLOWED = new Set(['http://localhost:9999', 'http://localhost:8969', 'http://localhost'])

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else yield p
  }
}

let dist
try {
  dist = [...walk(DIST)]
} catch {
  console.error(`assert-dist-clean: no dist/ at ${DIST} — run vite build first`)
  process.exit(1)
}

// The self-hosted-fonts guarantee, asserted on the BYTES THAT SHIP (feat/selfhost-webfonts). The
// launch claim is that no visitor request leaves the app's origin for TYPE: a lingering preconnect
// or a pasted Google Fonts snippet re-opens a TLS handshake to Google carrying the visitor's IP —
// the exact GDPR exposure the self-hosting removed — and nothing else would fail when it happens.
// Source-level tests (fontConfig, fontSubsetContract) pass while a bundler carries the string
// through, which is why this greps dist/. Scoped to the FONT origins by name, deliberately NOT all
// of googleapis.com: the Google Books metadata API (lib/enrich.ts) is a knowing, documented
// runtime dependency and lives in the bundle legitimately. There is no legitimate local case for a
// font origin, so unlike the local-URL class below this one fails even un-enforced local builds.
const FONT_ORIGINS = /fonts\.googleapis\.com|fonts\.gstatic\.com/gi

// ── The POSITIVE half of the self-hosted-fonts guarantee: the fonts are actually IN dist ────────
//
// The FONT_ORIGINS class above is one-sided: it proves nothing points at Google, not that the
// fonts shipped. SCAN_EXT never opens a woff2 (correct for pattern-scanning), so a build that
// dropped public/fonts/ entirely would pass the negative check completely clean. e2e cannot catch
// it either — the Playwright webServer runs vite DEV, which serves from public/ regardless of what
// the build emitted. And the deployed failure is SILENT, not loud: vercel.json rewrites
// "/(.*)" → /index.html, so a MISSING /fonts/files/*.woff2 returns 200 with HTML — the browser
// fails to parse it as a font, falls back to system type, and reports nothing. That is the exact
// failure removing the suite's font stub was meant to prevent ("it would have silently masked a
// broken local font path"), relocated from the test suite to the artifact — which is why this
// check exists here, on the artifact, and why deleting it as "redundant with the tests" would
// reopen that hole.
//
// Nothing below is a hardcoded count — counts rot the moment a skin or family changes (the
// two-copies staleness this repo has paid for twice). Everything derives from a source that
// changes FIRST when the truth changes:
//   · the per-skin stylesheet list keys off the SKIN REGISTRY (packages/core/src/skins.ts), the
//     SkinDivider/contrast-test pattern — a tenth skin fails here before it ships without fonts;
//   · the woff2 set is asserted as an exact MIRROR of public/fonts/files (vite copies public/
//     verbatim, so any divergence is a build fault) — and because an empty mirror mirrors an
//     empty directory, every url(/fonts/files/…) each shipped stylesheet declares must RESOLVE,
//     and the family floor comes from scripts/fetch-fonts.mjs's SOURCES map, the single writer.
//
// All of it fails HARD, matching the missing-dist branch above and FONT_ORIGINS' reasoning: the
// local-URL class warns locally because .env.local legitimately bakes local URLs; a missing
// shipped font has no legitimate case anywhere.
const REPO_ROOT = new URL('../../..', import.meta.url).pathname
const fontFailures = []

const skinsTs = readFileSync(join(REPO_ROOT, 'packages/core/src/skins.ts'), 'utf8')
const skinsBlock = skinsTs.match(/export const SKINS[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? ''
const skinIds = [...skinsBlock.matchAll(/^ {2}(\w+): \{/gm)].map((m) => m[1])
if (skinIds.length < 9) {
  console.error(
    `assert-dist-clean: parsed only ${skinIds.length} skin ids from packages/core/src/skins.ts — ` +
      'the registry shape changed; fix this parser rather than letting the font check go vacuous.',
  )
  process.exit(1)
}
for (const skin of skinIds) {
  const cssPath = join(DIST, 'fonts', `${skin}.css`)
  try {
    statSync(cssPath)
  } catch {
    fontFailures.push(`missing stylesheet: fonts/${skin}.css (skin '${skin}' is in the registry)`)
    continue
  }
  for (const m of readFileSync(cssPath, 'utf8').matchAll(/url\(\/fonts\/files\/([^)]+)\)/g)) {
    try {
      statSync(join(DIST, 'fonts', 'files', m[1]))
    } catch {
      fontFailures.push(`fonts/${skin}.css references fonts/files/${m[1]}, which is not in dist`)
    }
  }
}

const PUBLIC_FILES = new URL('../public/fonts/files', import.meta.url).pathname
const inPublic = new Set(readdirSync(PUBLIC_FILES))
let inDist = new Set()
try {
  inDist = new Set(readdirSync(join(DIST, 'fonts', 'files')))
} catch {
  fontFailures.push('dist/fonts/files is missing entirely')
}
for (const f of inPublic)
  if (!inDist.has(f)) fontFailures.push(`not copied to dist: fonts/files/${f}`)
for (const f of inDist)
  if (!inPublic.has(f)) fontFailures.push(`in dist but not in public/: fonts/files/${f}`)

const fetcher = readFileSync(join(REPO_ROOT, 'scripts/fetch-fonts.mjs'), 'utf8')
const familyCount = new Set([...fetcher.matchAll(/family=([A-Za-z+0-9]+)/g)].map((m) => m[1])).size
if (familyCount < 1) {
  console.error(
    'assert-dist-clean: parsed no families from scripts/fetch-fonts.mjs SOURCES — fix the parser.',
  )
  process.exit(1)
}
if (inDist.size < familyCount) {
  fontFailures.push(
    `dist/fonts/files holds ${inDist.size} woff2 for ${familyCount} families in SOURCES — at least one family shipped no file`,
  )
}

if (fontFailures.length > 0) {
  console.error(
    `assert-dist-clean: the self-hosted fonts did NOT fully ship — ${fontFailures.length} problem(s):`,
  )
  for (const f of fontFailures) console.error(`  ${f}`)
  process.exit(1)
}

const hits = []
const fontHits = []
for (const file of dist.filter((f) => SCAN_EXT.test(f))) {
  const text = readFileSync(file, 'utf8')
  const seen = new Set()
  for (const re of PATTERNS) {
    for (const m of text.matchAll(re)) {
      if (ALLOWED.has(m[0]) || seen.has(m.index)) continue
      seen.add(m.index)
      hits.push(
        `${relative(DIST, file)}: …${text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40)}…`,
      )
    }
  }
  for (const m of text.matchAll(FONT_ORIGINS)) {
    fontHits.push(
      `${relative(DIST, file)}: …${text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40)}…`,
    )
  }
}

if (fontHits.length > 0) {
  console.error(
    `assert-dist-clean: found ${fontHits.length} font-origin string(s) in dist/ — the fonts are ` +
      `self-hosted and NOTHING may point a visitor's browser at Google for type:`,
  )
  for (const h of fontHits) console.error(`  ${h}`)
  process.exit(1)
}

if (hits.length === 0) {
  console.log(
    `assert-dist-clean: OK — no local URLs and no font-origin strings in ${dist.length} dist files`,
  )
  process.exit(0)
}

const enforce = !!(process.env.VERCEL || process.env.CI || process.env.ENFORCE_DIST_CLEAN)
const header = `assert-dist-clean: found ${hits.length} local URL(s) baked into dist/:`
console[enforce ? 'error' : 'warn'](header)
for (const h of hits) console[enforce ? 'error' : 'warn'](`  ${h}`)
if (enforce) {
  console.error(
    'Refusing to deploy a bundle that points at a local backend. Fix VITE_SUPABASE_URL in the deploy environment.',
  )
  process.exit(1)
}
console.warn('(warning only — local builds bake .env.local by design; deploys enforce this)')
