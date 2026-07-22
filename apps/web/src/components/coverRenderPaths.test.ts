import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Regression guard for the Google Books "image not available" plate leaking back into Discover/Add.
// The plate is served at HTTP 200, so onError can't catch it — only CoverImage's onLoad +
// isGoogleNoCoverArt size check rejects it (packages/core covers.test.ts pins the dims). A raw
// `<img src={…cover…}>` bypasses that detector entirely (the PR #58 fix), which is exactly how the
// plate came back on the /add preview + results and the "from your authors" strip. Every surface
// that renders an EXTERNAL (search-sourced) cover must go through CoverImage. This fails the moment
// one reverts to a raw <img> bound to a cover, so the fix can't silently regress again.

const SURFACES = [
  '../routes/DiscoverRoute.tsx',
  '../routes/AddRoute.tsx',
  '../planner/FromYourAuthors.tsx',
]

// a raw <img …> whose src is bound to a cover value (…cover… / it.cover / r.cover / hit.cover)
const RAW_COVER_IMG = /<img\b[^>]*\bsrc=\{[^}]*\bcover\b[^}]*\}/i

describe('external-cover surfaces route through CoverImage (no raw <img> plate leak)', () => {
  for (const rel of SURFACES) {
    it(`${rel} renders covers via CoverImage, never a raw <img>`, () => {
      const src = readFileSync(join(__dirname, rel), 'utf8')
      const m = src.match(RAW_COVER_IMG)
      expect(m, m ? `raw cover <img> found — route it through CoverImage: ${m[0]}` : '').toBeNull()
      expect(src).toContain('CoverImage')
    })
  }
})
