import { expect, test } from './support/fixtures'

// The signed-out front door is now the gold master-brand landing + a password/social auth screen
// (the magic-link screen is gone). The a11y sweep's seeded signInWithPassword exercises the same
// password path these screens use.

test('signed-out landing shows the gold front door', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /beautifully kept/i })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Get started' }).first()).toBeVisible()
})

// Fraunces is Tryst's #1 character lever and the landing's display face. This used to assert
// `fonts.check('600 24px "Fraunces"')` against a REAL Google Fonts fetch, which made a required
// check depend on a third party's uptime — a CDN hiccup blocked every merge. What this repo
// controls is that the landing ASKS for Fraunces and APPLIES it to the display element; whether
// gstatic served bytes this second is not this app's contract.
//
// The mechanism (served vs. dead CDN, both forced with route interception) is covered once in
// e2e/fonts.spec.ts; the all-nine-skins matrix lives in src/skin/fontConfig.test.ts.
test('the landing asks for Fraunces and applies it to the display face', async ({ page }) => {
  await page.goto('/')
  const heading = page.getByRole('heading', { name: /beautifully kept/i })
  await expect(heading).toBeVisible()

  // Requested: the pre-paint boot script injected tryst's pairing, which names Fraunces.
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('link[data-skin-font]')].map((l) => l.getAttribute('href') ?? ''),
  )
  expect(hrefs.some((h) => h.includes('Fraunces'))).toBe(true)

  // Applied: the display element resolves to a stack led by Fraunces, with a real generic behind
  // it — so a slow CDN degrades to system serif rather than to nothing.
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
