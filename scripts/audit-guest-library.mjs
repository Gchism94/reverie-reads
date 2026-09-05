/* global document, window */
// Exercises only the temporary public library. Never signs in or writes to a backend.
import { chromium, expect } from '../apps/web/node_modules/@playwright/test/index.mjs'
import AxeBuilder from '../apps/web/node_modules/@axe-core/playwright/dist/index.js'
import { mkdir, writeFile } from 'node:fs/promises'
const url = process.argv[2] ?? 'http://127.0.0.1:4334'
const folder = 'output/playwright/guest-experience'
await mkdir(folder, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
})
const page = await context.newPage()
const results = []
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
async function audit(skin, mode, state) {
  const result = await new AxeBuilder.default({ page })
    .include('#try-library')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  results.push({
    skin,
    mode,
    state,
    violations: result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, reason: n.failureSummary })),
    })),
  })
}
try {
  await page.goto(url)
  const full = page.getByTestId('guest-library-full')
  const stage = page.getByTestId('active-reading-room')
  await full.waitFor()
  const tabs = await page
    .getByRole('tablist', { name: 'Reverie reading rooms' })
    .getByRole('tab')
    .all()
  for (const tab of tabs) {
    await tab.click()
    const skin = await stage.getAttribute('data-active-skin')
    for (const mode of ['light', 'dark']) {
      await stage
        .getByRole('button', { name: mode === 'light' ? 'Day' : 'Night', exact: true })
        .click()
      await page.evaluate(() => document.fonts.ready)
      await full.getByRole('button', { name: 'Open Jane Eyre', exact: true }).click()
      await audit(skin, mode, 'book-details')
      await full.getByRole('button', { name: 'Add books', exact: true }).click()
      await audit(skin, mode, 'catalog')
      await full.getByRole('button', { name: 'Enter a book', exact: true }).click()
      await audit(skin, mode, 'manual-add')
      await full.getByRole('button', { name: 'Arrange dock', exact: true }).click()
      await audit(skin, mode, 'dock')
      if (['tryst', 'folio', 'aphelion', 'hearth'].includes(skin)) {
        await page.evaluate(() => window.scrollTo(0, 0))
        const clip = await stage.boundingBox()
        await page.screenshot({ path: `${folder}/${skin}-${mode}-dock.png`, fullPage: true, clip })
      }
      await full.getByRole('button', { name: 'Back to library', exact: true }).click()
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: /^Marginalia / }).click()
  await stage.getByRole('button', { name: 'Day', exact: true }).click()
  for (const state of ['book', 'catalog', 'manual', 'dock']) {
    if (state === 'book')
      await full.getByRole('button', { name: 'Open Jane Eyre', exact: true }).click()
    if (state === 'catalog')
      await full.getByRole('button', { name: 'Add books', exact: true }).click()
    if (state === 'manual')
      await full.getByRole('button', { name: 'Enter a book', exact: true }).click()
    if (state === 'dock')
      await full.getByRole('button', { name: 'Arrange dock', exact: true }).click()
    await page.evaluate(() => window.scrollTo(0, 0))
    const clip = await stage.boundingBox()
    await page.screenshot({ path: `${folder}/phone-${state}.png`, fullPage: true, clip })
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `${state}/${width}`,
      ).toBe(width)
    }
    await page.setViewportSize({ width: 390, height: 844 })
  }
  await writeFile(`${folder}/audit.json`, JSON.stringify({ url, errors, results }, null, 2))
  expect(errors).toEqual([])
  expect(results.flatMap((result) => result.violations)).toEqual([])
  console.log(
    JSON.stringify({
      scans: results.length,
      errors,
      violations: results.flatMap((row) => row.violations).length,
      folder,
    }),
  )
} finally {
  await browser.close()
}
