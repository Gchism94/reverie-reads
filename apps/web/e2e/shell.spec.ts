import { expect, test } from '@playwright/test'

// The signed-out front door is now the gold master-brand landing + a password/social auth screen
// (the magic-link screen is gone). The a11y sweep's seeded signInWithPassword exercises the same
// password path these screens use.

test('signed-out landing shows the gold front door', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /beautifully kept/i })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Get started' }).first()).toBeVisible()
})

// Fraunces is Tryst's #1 character lever and the landing's display face — guard that it actually
// LOADS (no silent fall back to system serif). The gold brand requests it via Google Fonts.
test('Fraunces (display face) actually loads — no silent serif fallback', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => (document as Document & { fonts: FontFaceSet }).fonts.ready)
  const loaded = await page.evaluate(() =>
    (document as Document & { fonts: FontFaceSet }).fonts.check('600 24px "Fraunces"'),
  )
  expect(loaded, 'Fraunces did not load — Tryst would silently fall back to system serif').toBe(true)
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
