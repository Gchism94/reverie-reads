import { test as base, expect, type Page } from '@playwright/test'

/**
 * The suite's shared `test`. Import from here, not from '@playwright/test' directly, so anything
 * that has to be true for EVERY spec has one place to live.
 *
 * ── THE FONT STUB IS GONE, AND WHY THAT IS THE RIGHT CALL NOW ───────────────────────────────────
 * This file used to stub fonts.googleapis.com with an empty 200 for every spec, because a
 * third-party CDN in the path of the whole suite broke required checks twice (#207's history:
 * a fonts.check() against a real fetch, then console-clean failing on a single gstatic 404 —
 * 10 of 19 red CI runs over 17 days were dead third parties). The fonts are now SELF-HOSTED
 * (public/fonts, feat/selfhost-webfonts): every stylesheet and woff2 is a first-party static file
 * served by the same webServer the suite already depends on for the app itself. There is no
 * third-party availability to insulate against — and a stub kept "for determinism" would mask a
 * genuinely broken font path in every spec except fonts.spec.ts, which is the a11y-fixture lesson
 * (a defect invisible because nothing ever looked) pointed at fonts. So the suite renders the real
 * faces a reader sees, and fonts.spec.ts owns the mechanism's failure direction explicitly.
 */
/**
 * ── AND THE COVER HOSTS, STUBBED BY DEFAULT FOR THE SAME REASON ─────────────────────────────────
 * The font CDN above is one instance of a general problem, and the general problem cost more than
 * the specific one. The CI cost/value audit (`docs/audits/ci-suite-cost-value-audit.md`) counted
 * every red CI run over 17 days: **10 of 19 were a dead third-party dependency** — more than every
 * other cause combined, and more than twice the number of real regressions caught.
 *
 * Both halves of that 10 were covers, in two disguises:
 *   1. `fonts.spec.ts` and `console-clean.spec.ts` red on four unrelated branches over two days,
 *      2026-08-12/13 — the font CDN, fixed above.
 *   2. `e2e-a11y` red five times over 2026-08-16/17 — the SEEDED COVER HOTLINKS. The 290-book seed
 *      points at 13 commercial hosts (m.media-amazon.com 168 books, prodimage.images-bn.com 75,
 *      encrypted-tbn0.gstatic.com 35, then a long tail), and discoverCurated.ts adds 35 more to
 *      covers.openlibrary.org. Two of those hosts stopped answering; a trace measured 55 of ~200
 *      requests dead and ONE navigation burning 407.8s.
 *
 * Fixed once for a11y in #262, then generalised here, because `rest` and `mobile` load the same
 * covers from the same hosts and had already gone red from the same class a week earlier.
 *
 * ── MATCHED BY RESOURCE TYPE, NOT BY HOST ───────────────────────────────────────────────────────
 * A host allowlist only ever names the host that broke last time. `cover-sourcing.spec.ts` and
 * `discover-curated.spec.ts` each carry one naming `covers.openlibrary.org` — neither would have
 * caught B&N, and neither will catch the 14th host. `resourceType` is the browser's own
 * classification of what it is fetching, so it covers every present host, any future one, and
 * query-string URLs that no extension match would catch.
 *
 * ── WHY THIS DOES NOT CLOBBER THE SPECS THAT MEASURE REAL IMAGES ────────────────────────────────
 * Playwright matches route handlers in REVERSE registration order. This one is registered in the
 * `page` fixture, before any test body runs, so every spec-level `page.route` registered later
 * takes precedence. That is what keeps the three specs that serve dimensionally-exact fixture PNGs
 * working unchanged — `discover-cover-quality.spec.ts` (reads naturalWidth/naturalHeight/complete
 * to detect degenerate Google renders), `route-viewport.spec.ts` and
 * `spine-shelf-reachability.spec.ts` (cover-aspect assertions). Checked before writing this, not
 * assumed: those three are the only specs in the suite that assert on rendered image pixels.
 */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

export const test = base.extend<{ stubCoverImages: boolean }>({
  /**
   * Opt OUT with `test.use({ stubCoverImages: false })` for a spec whose subject is real
   * third-party image delivery itself. Nothing needs this today — a spec that serves its own
   * fixture bytes should register its own route instead, which already wins on ordering.
   */
  stubCoverImages: [true, { option: true }],

  // The second arg is Playwright's fixture callback, conventionally named `use`. It is named
  // `runTest` here because eslint's react-hooks/rules-of-hooks reads a bare `use(...)` call as the
  // React `use` hook and errors. Playwright binds by position, not name, so this is a rename only.
  page: async ({ page, stubCoverImages }, runTest) => {
    if (stubCoverImages) {
      await page.route(
        (url) =>
          (url.protocol === 'http:' || url.protocol === 'https:') &&
          url.hostname !== 'localhost' &&
          url.hostname !== '127.0.0.1',
        (route) => {
          if (route.request().resourceType() === 'image')
            return route.fulfill({ contentType: 'image/png', body: PNG_1X1 })
          return route.fallback()
        },
      )
    }
    await runTest(page)
  },
})

export { expect, type Page }
