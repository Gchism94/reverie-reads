import { expect, test, type Page } from './support/fixtures'

// Font loading, asserted against OUR contract instead of Google's uptime.
//
// ── WHAT THIS USED TO DO, AND WHY IT CHANGED ────────────────────────────────────────────────────
// The previous version signed a user in, visited /skins, and asserted `document.fonts.check()` for
// 18 hand-listed families. Every one of those assertions could fail for two unrelated reasons — a
// real config drift, or fonts.googleapis.com being slow, rate-limited, or down — and it could not
// distinguish them. `e2e` is a required check, so the second reason blocked every merge in the
// repo (it blocked #206). It was testing a third party's availability, not this app.
//
// The coverage is NOT reduced, it is split by what each layer can actually answer:
//   · src/skin/fontConfig.test.ts (unit, no browser) now owns the MATRIX — all nine skins, that
//     each requests the families its own tokens name, that index.html's pre-paint boot map matches
//     src/skin/fonts.ts, that every stack ends in a real generic fallback. That is where the
//     18-family list's real intent lives now, and it covers more than 18 families' presence did.
//   · this file owns the MECHANISM, once, in a browser: the app requests its stylesheet, the
//     browser registers the family, and — the case nothing tested before — the app stays readable
//     when the CDN does not answer at all.
//
// ── WHY INTERCEPTION, NOT A REAL FETCH ──────────────────────────────────────────────────────────
// Both directions are forced with page.route, so neither depends on the network being any
// particular way. The served CSS is our own @font-face, so the assertion "the family registered"
// is true because the app asked for a stylesheet and the browser parsed it — not because a font
// file happened to download. `src: local(...)` is deliberately NOT relied on for a pass: whether
// Georgia or DejaVu exists differs between a macOS laptop and a CI runner, and that difference is
// exactly the kind of environmental coin-flip this rewrite exists to remove.

// ── THE ONE SPEC THAT OPTS OUT OF THE SUITE-WIDE FONT STUB ──────────────────────────────────────
// support/fixtures.ts stubs fonts.googleapis.com with an empty 200 for EVERY spec, because a
// third-party CDN in the path of the whole suite has broken required checks twice (see that file).
// This spec is the deliberate exception: its entire purpose is exercising the real font mechanism
// in BOTH directions — served and dead — which it forces itself, per test, with page.route below.
// Leaving the blanket stub on would make every assertion here vacuous: the stub declares no
// @font-face, so "the family registered" could never be true and "the CDN is dead" would be
// trivially true. Do not remove this line to make something else pass.
test.use({ stubFonts: false })

const GOOGLE_CSS = '**/fonts.googleapis.com/**'

/** The families the landing page's skin (tryst) depends on — see FONT_CSS.tryst. */
const TRYST_DISPLAY = 'Fraunces'

/** Serve a stylesheet that DEFINES the family, so the browser registers it without any download. */
async function serveFontCss(page: Page): Promise<void> {
  await page.route(GOOGLE_CSS, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/css',
      // A real @font-face block. local() candidates are a nicety — the assertions below key off
      // registration and computed style, both of which hold whether or not one resolves.
      body: `@font-face{font-family:'${TRYST_DISPLAY}';font-style:normal;font-weight:400 700;font-display:swap;src:local('Georgia'),local('DejaVu Serif'),local('Liberation Serif'),local('Times New Roman');}`,
    }),
  )
}

/** Fail every font request, the way a blocked, throttled, or offline CDN does. */
async function blockFontCss(page: Page): Promise<void> {
  await page.route(GOOGLE_CSS, (route) => route.abort())
}

const registeredFamilies = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...(document as Document & { fonts: FontFaceSet }).fonts].map((f) => f.family),
  )

/** The stylesheet links the app injects for its skin pairing (boot script + src/skin/fonts.ts). */
const skinFontHrefs = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('link[data-skin-font]')].map((l) => l.getAttribute('href') ?? ''),
  )

test('the app requests its skin stylesheet and registers the family it declares', async ({
  page,
}) => {
  await serveFontCss(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /beautifully kept/i })).toBeVisible()

  // (a) OUR markup: the pre-paint boot script injected the active skin's pairing, pointing at the
  //     css2 endpoint. This is the request the reader's browser actually makes.
  const hrefs = await skinFontHrefs(page)
  expect(
    hrefs.length,
    'no link[data-skin-font] — the boot script did not inject a pairing',
  ).toBeGreaterThan(0)
  expect(hrefs.some((h) => h.includes('fonts.googleapis.com/css2'))).toBe(true)
  expect(hrefs.some((h) => h.includes(TRYST_DISPLAY))).toBe(true)
  expect(hrefs.every((h) => h.includes('display=swap'))).toBe(true)

  // (b) THE BROWSER acted on it: the stylesheet was fetched, parsed, and the family registered.
  await page.evaluate(() => (document as Document & { fonts: FontFaceSet }).fonts.ready)
  expect(await registeredFamilies(page)).toContain(TRYST_DISPLAY)

  // (b) …and the intended stack is applied to the element that carries the skin's voice.
  const stack = await page
    .getByRole('heading', { name: /beautifully kept/i })
    .evaluate((el) => getComputedStyle(el).fontFamily)
  expect(stack).toContain(TRYST_DISPLAY)
})

test('a dead font CDN degrades to the declared fallback — readable, never tofu', async ({
  page,
}) => {
  await blockFontCss(page)
  await page.goto('/')

  // The page still renders. This is the whole point: a font CDN is a decoration, not a dependency,
  // and nothing tested this before.
  const heading = page.getByRole('heading', { name: /beautifully kept/i })
  await expect(heading).toBeVisible()

  // The webfont genuinely did not arrive — otherwise the rest of this test proves nothing.
  //
  // Asserted on REGISTRATION, not `fonts.check()`, and the difference is the whole trap: with the
  // stylesheet aborted no @font-face rule exists at all, so the browser treats 'Fraunces' as an
  // unknown SYSTEM family, finds it absent, and reports `check()` → true (nothing to load, the
  // cascade will fall through). `check()` only returns false for a face that IS registered and has
  // not loaded. Measured here, not assumed: this assertion failed as `toBe(false)` on the first
  // run for exactly that reason. The registered-face set has no such ambiguity.
  await page.evaluate(() =>
    (document as Document & { fonts: FontFaceSet }).fonts.ready.catch(() => undefined),
  )
  expect(
    await registeredFamilies(page),
    'the CDN was supposed to be blocked — no @font-face should have registered',
  ).not.toContain(TRYST_DISPLAY)

  // The declared fallback is still in the cascade, so the browser has something real to render
  // with — the stack ends in a generic (fontConfig.test.ts enforces that for every skin).
  const stack = await heading.evaluate((el) => getComputedStyle(el).fontFamily)
  expect(stack.toLowerCase()).toMatch(/serif|system-ui|georgia/)

  // Readable, not collapsed and not a row of tofu boxes: real laid-out text with real dimensions.
  const box = await heading.boundingBox()
  expect(box, 'the heading has no layout box at all').toBeTruthy()
  expect(box!.width).toBeGreaterThan(50)
  expect(box!.height).toBeGreaterThan(8)
  expect((await heading.textContent())?.trim().length ?? 0).toBeGreaterThan(0)
})
