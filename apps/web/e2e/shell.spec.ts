import { expect, test } from '@playwright/test'

test('serves a themed sign-in screen when signed out', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', /nocturne|dawn/)
  // Signed out, the app shows the magic-link sign-in.
  await expect(page.getByRole('button', { name: /magic link/i })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
})
