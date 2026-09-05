import { expect, test } from './support/fixtures'

// The signed-out front door is now the gold master-brand landing + a password/social auth screen
// (the magic-link screen is gone). The a11y sweep's seeded signInWithPassword exercises the same
// password path these screens use.

test('signed-out landing shows the gold front door', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Find your next read in your own library.' }),
  ).toBeVisible()
  await expect(page.locator('#top').getByRole('link', { name: 'Start your library' })).toBeVisible()
})

// Fraunces is Tryst's #1 character lever and the landing's display face. The css2 era asserted the
// injected href NAMED Fraunces, because the URL's query string was the only place the request said
// what it was for. Self-hosted (feat/selfhost-webfonts), the pairing is /fonts/tryst.css and the
// family lives in the stylesheet's own @font-face rules — so "asks for Fraunces" is now asserted
// where it's actually stated: the skin's local stylesheet is requested, and the browser registers
// the Fraunces faces it declares.
//
// The mechanism (served vs. dead stylesheet, both directions) is covered once in e2e/fonts.spec.ts;
// the all-nine-skins matrix lives in src/skin/fontConfig.test.ts.
test('the landing asks for Fraunces and applies it to the display face', async ({ page }) => {
  await page.goto('/')
  const heading = page.getByTestId('landing-display-heading')
  await expect(heading).toBeVisible()

  // Requested: the pre-paint boot script injected tryst's self-hosted pairing…
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('link[data-skin-font]')].map((l) => l.getAttribute('href') ?? ''),
  )
  expect(hrefs).toContain('/fonts/tryst.css')

  // …whose @font-face rules the browser parsed into registered Fraunces faces.
  await page.evaluate(() => (document as Document & { fonts: FontFaceSet }).fonts.ready)
  const families = await page.evaluate(() =>
    [...(document as Document & { fonts: FontFaceSet }).fonts].map((f) => f.family),
  )
  expect(families).toContain('Fraunces')

  // Applied: the display element resolves to a stack led by Fraunces, with a real generic behind
  // it — so a missing font file degrades to system serif rather than to nothing.
  const stack = await heading.evaluate((el) => getComputedStyle(el).fontFamily)
  expect(stack).toContain('Fraunces')
  expect(stack.toLowerCase()).toMatch(/serif/)
})

test('auth screen offers password + social, and toggles sign-in / sign-up', async ({ page }) => {
  await page.goto('/auth')
  // Log in (default) — password is the functional path.
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible()
  // Social present (inert until the provider apps are provisioned).
  await expect(page.getByRole('button', { name: 'Google' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Apple' })).toBeVisible()
  // Toggle to sign-up.
  await page.getByRole('button', { name: 'Create an account' }).click()
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
})
