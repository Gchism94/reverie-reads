import { expect, test } from '@playwright/test'

test('renders the themed shell and toggles light/dark', async ({ page }) => {
  await page.goto('/')

  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', /nocturne|dawn/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const toggle = page.getByRole('button', { name: /switch theme/i })
  const before = await html.getAttribute('data-theme')
  await toggle.click()
  const after = await html.getAttribute('data-theme')
  expect(after).not.toBe(before)
})
