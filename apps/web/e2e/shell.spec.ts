import { expect, test } from '@playwright/test'

test('serves a themed sign-in screen when signed out', async ({ page }) => {
  await page.goto('/')

  // The skin engine reflects the active skin + resolved mode onto <html> (skin/useSkin.ts:apply),
  // not data-theme. Signed out with a clean storage state the default skin (tryst) applies, and
  // 'system' mode resolves to light or dark from the OS preference.
  await expect(page.locator('html')).toHaveAttribute('data-skin', /tryst|grimoire|aphelion|marrow/)
  await expect(page.locator('html')).toHaveAttribute('data-mode', /light|dark/)

  // Signed out the app shows the magic-link sign-in (SignIn.tsx → signInWithOtp). The password +
  // Google/Apple auth screens in the design aren't built yet; update these once they are.
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByRole('button', { name: /magic link/i })).toBeVisible()
})
