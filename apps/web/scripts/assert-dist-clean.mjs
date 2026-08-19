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
const PATTERNS = [/(https?|wss?):\/\/(localhost|127\.0\.0\.1)(:\d+)?/gi, /:5[45]321\b/g]

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
