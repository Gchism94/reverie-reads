import { test as base, expect, type Page } from '@playwright/test'

/**
 * The suite's shared `test`. Import from here, not from '@playwright/test' directly, so anything
 * that has to be true for EVERY spec has one place to live.
 *
 * ── WHY THIS EXISTS: THE FONT CDN, STUBBED BY DEFAULT ───────────────────────────────────────────
 * Every page load requests a Google Fonts stylesheet (index.html's pre-paint boot script), which
 * in turn requests woff2 binaries from fonts.gstatic.com. That put a third-party CDN in the path of
 * the whole suite, and it has bitten twice in two different disguises:
 *
 *   1. specs asserting ON fonts — fonts.spec.ts / shell.spec.ts asserted `document.fonts.check()`
 *      against a real fetch, so a CDN hiccup failed a REQUIRED check and blocked every merge.
 *      Fixed in #207 by moving those assertions onto our own contract.
 *   2. a spec that merely LOADS fonts — console-clean.spec.ts asserts the page produces zero
 *      console errors. It never mentions fonts, but a single gstatic 404 fails it. Confirmed from
 *      the CI trace: five gstatic requests returned 200 and one returned 404, and the 404 was the
 *      only request made over HTTP/1.1 while every success was HTTP/2 — CDN edge inconsistency,
 *      nothing this app controls.
 *
 * A third disguise is predictable, so the stub is a DEFAULT rather than a per-spec opt-in.
 *
 * ── WHY FULFILL EMPTY, NOT ABORT ────────────────────────────────────────────────────────────────
 * Aborting is the tempting one-liner and it is wrong twice over. An aborted request surfaces as a
 * resource error — precisely what console-clean.spec.ts asserts against, so it would swap one
 * failure for another. And per #207's own finding, an aborted stylesheet registers NO @font-face at
 * all, which changes `document.fonts` semantics in ways a spec might unknowingly depend on. An
 * empty 200 stylesheet is inert: it parses, declares no faces, and therefore causes no gstatic
 * request to be made — the binaries are only fetched because @font-face rules name them.
 *
 * Text still renders throughout the suite: every --font-display / --font-body stack ends in a real
 * generic fallback, which src/skin/fontConfig.test.ts enforces for all nine skins.
 */
export const test = base.extend<{ stubFonts: boolean }>({
  /**
   * Opt OUT with `test.use({ stubFonts: false })` when a spec's whole purpose is the font
   * mechanism itself. fonts.spec.ts does exactly that — it forces both network directions on
   * purpose, so a blanket stub would make it assert nothing. Nothing else should need this.
   */
  stubFonts: [true, { option: true }],

  // The second arg is Playwright's fixture callback, conventionally named `use`. It is named
  // `runTest` here because eslint's react-hooks/rules-of-hooks reads a bare `use(...)` call as the
  // React `use` hook and errors. Playwright binds by position, not name, so this is a rename only.
  page: async ({ page, stubFonts }, runTest) => {
    if (stubFonts) {
      await page.route('**/fonts.googleapis.com/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
      )
    }
    await runTest(page)
  },
})

export { expect, type Page }
