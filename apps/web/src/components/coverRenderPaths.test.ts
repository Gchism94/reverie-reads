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
  // feat/discover-phase-a: Discover's SEARCH half renders through SearchResults (so does the
  // shelf-bound ExternalSearchSheet), and MoreLikeThis is the same taste surface on the book page.
  // Neither was guarded — a raw <img> added to SearchResults would have regressed Discover search
  // with this file green, because only the route component was listed.
  '../components/SearchResults.tsx',
  '../book/MoreLikeThis.tsx',
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

// ── The Discover licensing boundary: candidate covers are HOTLINK-ONLY, never ingested ─────────
// Discover surfaces books the reader does not own; storing their cover bytes is the same line that
// killed the global cover cache (BACKLOG, decision 2026-08). The boundary has three layers —
//   1. core: isIngestibleCoverUrl refuses Google-host URLs outright (covers.test.ts:214)
//   2. server: the covers function's INGESTIBLE_SOURCES excludes 'google' + the display_only_source
//      422 judges by HOST, so even a mislabelled request is refused
//   3. here: the Discover surfaces simply never touch the ingest machinery at all
// Layer 3 is the one a well-meaning feature would cross by accident ("let's cache the rail covers"),
// so it is pinned: these files must not import or invoke the covers ingest pipeline. discover.ts
// legitimately invokes OTHER edge functions ('releases', 'embed') — the ban is covers-specific.
describe('Discover never ingests candidate covers — hotlink-only, by construction', () => {
  const DISCOVER_FILES = [
    '../routes/DiscoverRoute.tsx',
    '../components/SearchResults.tsx',
    '../components/ExternalSearchSheet.tsx',
    '../lib/discover.ts',
  ]
  const INGEST_MARKERS = [/\bingestCover\b/, /invoke\(\s*['"`]covers['"`]/, /\bcacheCoverUrl\b/]
  for (const rel of DISCOVER_FILES) {
    it(`${rel} does not reach the cover-ingest pipeline`, () => {
      const src = readFileSync(join(__dirname, rel), 'utf8')
      for (const re of INGEST_MARKERS) {
        expect(re.test(src), `${rel} matches ${re} — Discover covers are hotlink-only`).toBe(false)
      }
    })
  }
  // Positive control: the markers DO catch the real ingest call site, so a rename can't blind them.
  it('positive control: the markers match the actual ingest entry point', () => {
    const covers = readFileSync(join(__dirname, '../lib/covers.ts'), 'utf8')
    expect(INGEST_MARKERS.some((re) => re.test(covers))).toBe(true)
  })
})
