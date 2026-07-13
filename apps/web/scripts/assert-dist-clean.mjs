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

const hits = []
for (const file of dist.filter((f) => SCAN_EXT.test(f))) {
  const text = readFileSync(file, 'utf8')
  const seen = new Set()
  for (const re of PATTERNS) {
    for (const m of text.matchAll(re)) {
      if (ALLOWED.has(m[0]) || seen.has(m.index)) continue
      seen.add(m.index)
      hits.push(`${relative(DIST, file)}: …${text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40)}…`)
    }
  }
}

if (hits.length === 0) {
  console.log(`assert-dist-clean: OK — no local URLs in ${dist.length} dist files`)
  process.exit(0)
}

const enforce = !!(process.env.VERCEL || process.env.CI || process.env.ENFORCE_DIST_CLEAN)
const header = `assert-dist-clean: found ${hits.length} local URL(s) baked into dist/:`
console[enforce ? 'error' : 'warn'](header)
for (const h of hits) console[enforce ? 'error' : 'warn'](`  ${h}`)
if (enforce) {
  console.error('Refusing to deploy a bundle that points at a local backend. Fix VITE_SUPABASE_URL in the deploy environment.')
  process.exit(1)
}
console.warn('(warning only — local builds bake .env.local by design; deploys enforce this)')
