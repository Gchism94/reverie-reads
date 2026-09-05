/* global document, getComputedStyle, innerWidth, window */
// Read-only browser inspection. Never signs into an account or adds library data.
import { chromium, expect } from '../apps/web/node_modules/@playwright/test/index.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import AxeBuilder from '../apps/web/node_modules/@axe-core/playwright/dist/index.js'
import { createHash } from 'node:crypto'
const url = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'http://127.0.0.1:4334'
const screenshotsOnly = process.argv.includes('--screenshots-only')
const folder = 'output/playwright/reading-rooms'
await mkdir(folder, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const rooms = [
  'tryst',
  'grimoire',
  'aphelion',
  'marrow',
  'umbra',
  'folio',
  'hearth',
  'almanac',
  'bloom',
]
const labels = [
  'Tryst',
  'Grimoire',
  'Aphelion',
  'Marrow',
  'Gaslight',
  'Marginalia',
  'Hearth',
  'Almanac',
  'Firstlight',
]
// A reader can place the heading below the sticky navigation. Locator screenshots instead
// align a tall room at the viewport origin, letting that navigation cover the captured heading.
// Clip the document from its top so the review captures the actual room without that artifact.
async function captureRoom(element, path) {
  await page.evaluate(() => window.scrollTo(0, 0))
  const box = await element.boundingBox()
  if (!box) throw new Error('Room has no rendered bounds')
  await page.screenshot({ path, fullPage: true, clip: box })
}
const evidence = []
const accessibility = []
try {
  await page.goto(url)
  await page.getByRole('tablist', { name: 'Reverie reading rooms' }).waitFor()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `${folder}/brand-desktop.png`, fullPage: true })
  await captureRoom(page.locator('#top'), `${folder}/brand-hero.png`)
  const titleStyle = await page.locator('h1').evaluate((el) => ({
    family: getComputedStyle(el).fontFamily,
    line: parseFloat(getComputedStyle(el).lineHeight) / parseFloat(getComputedStyle(el).fontSize),
  }))
  expect(titleStyle.family).toContain('Newsreader')
  expect(titleStyle.line).toBeGreaterThanOrEqual(1.1)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const [i, skin] of rooms.entries()) {
      await page.getByRole('tab', { name: new RegExp(`^${labels[i]} `) }).click()
      for (const mode of ['light', 'dark']) {
        const stage = page.getByTestId('active-reading-room')
        await stage
          .getByRole('button', { name: mode === 'light' ? 'Day' : 'Night', exact: true })
          .click()
        await page.evaluate(() => document.fonts.ready)
        const examples = page.getByTestId('room-example')
        for (const example of await examples.all()) {
          await expect(example).toHaveAttribute('data-skin', skin)
          await expect(example).toHaveAttribute('data-mode', mode)
        }
        const overflow = await page.evaluate(
          () =>
            Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        )
        expect(overflow, `${skin}/${mode}/${width}`).toBeLessThanOrEqual(1)
        if (width === 1440 && !screenshotsOnly) {
          const result = await new AxeBuilder.default({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
          accessibility.push({
            skin,
            mode,
            violations: result.violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => n.target),
            })),
          })
        }
        const file = `${skin}-${mode}-${width}.png`
        await captureRoom(stage, `${folder}/${file}`)
        const canvas = await stage
          .locator('canvas')
          .evaluate((el) => ({ pixels: el.width * el.height, data: el.toDataURL() }))
        expect(canvas.pixels).toBeLessThanOrEqual(1_810_000)
        evidence.push({
          skin,
          label: labels[i],
          mode,
          width,
          file,
          overflow,
          canvasPixels: canvas.pixels,
          sceneHash: createHash('sha256').update(canvas.data).digest('hex'),
        })
      }
    }
  }
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.getByRole('tab', { name: /^Marginalia / }).click()
    await page
      .getByTestId('active-reading-room')
      .getByRole('button', { name: 'Day', exact: true })
      .click()
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `${folder}/brand-${width}.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  }
  expect(errors).toEqual([])
  expect(accessibility.flatMap((row) => row.violations)).toEqual([])
  expect(new Set(evidence.map((row) => row.sceneHash)).size).toBe(36)
  await writeFile(
    `${folder}/${screenshotsOnly ? 'captures' : 'audit'}.json`,
    JSON.stringify({ url, titleStyle, errors, accessibility, captures: evidence }, null, 2),
  )
  console.log(
    JSON.stringify({ captures: evidence.length, errors, titleStyle, folder, accessibility }),
  )
} finally {
  await browser.close()
}
