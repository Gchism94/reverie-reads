import { expect, test } from '@playwright/test'

test.describe('signed-out landing', () => {
  test('tells the shipped product story and preserves explicit auth destinations', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { level: 1, name: 'Keep the whole story of your reading life.' }),
    ).toBeVisible()
    await expect(page.getByTestId('landing-desktop-screen').first()).toBeVisible()
    await expect(page.getByTestId('landing-mobile-screen').first()).toBeVisible()
    for (const heading of [
      'The whole room changes with the shelf.',
      'Keep every version of the story.',
      'Share a shelf without merging lives.',
      'Connect series without flattening them.',
    ]) {
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeAttached()
    }

    await expect(page.getByRole('link', { name: 'Begin your library' }).first()).toHaveAttribute(
      'href',
      '/auth?mode=signup',
    )
    await expect(page.getByRole('link', { name: 'Return to Reverie' })).toHaveAttribute(
      'href',
      '/auth?mode=signin',
    )

    await expect(page).toHaveTitle('Reverie — Your reading life, kept in full')
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /books, rereads, series, plans/i,
    )
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://reveriereads.app/reverie-share.png',
    )

    const shareSize = await page.evaluate(async () => {
      const image = new Image()
      const loaded = new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => reject(new Error('share preview did not load')), {
          once: true,
        })
      })
      image.src = '/reverie-share.png'
      await loaded
      return { width: image.naturalWidth, height: image.naturalHeight }
    })
    expect(shareSize).toEqual({ width: 1200, height: 630 })
  })

  test('mobile navigation is touch-sized and the complete story stays within the viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page
      .getByRole('heading', { name: 'Make room for every book you’ve lived with.' })
      .waitFor({
        state: 'attached',
      })

    const nav = page.getByRole('navigation', { name: 'Landing', exact: true })
    const menu = nav.getByRole('button', { name: 'Menu' })
    await expect(menu).toBeVisible()
    expect(await menu.boundingBox()).toMatchObject({ width: 44, height: 44 })

    await menu.click()
    await expect(nav.getByRole('link', { name: 'Rooms' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Connect it' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Log in' })).toBeVisible()

    const width = await page.evaluate(() => ({
      viewport: window.innerWidth,
      root: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }))
    expect(width).toEqual({ viewport: 390, root: 390, body: 390 })
  })

  test('reduced motion keeps the page still without removing its story', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')

    await expect(
      page.getByRole('heading', { name: 'The whole room changes with the shelf.' }),
    ).toBeAttached()
    const animations = await page.locator('.rv-anim').evaluateAll((nodes) =>
      nodes.map((node) => ({
        name: getComputedStyle(node).animationName,
        duration: getComputedStyle(node).animationDuration,
      })),
    )
    expect(animations.every(({ name, duration }) => name === 'none' || duration === '0s')).toBe(
      true,
    )
  })

  test('the nine-room atlas changes the complete product stage and its mode', async ({ page }) => {
    await page.goto('/')

    const rooms = page.getByRole('tablist', { name: 'Reverie reading rooms' })
    await expect(rooms.getByRole('tab')).toHaveCount(9)

    await rooms.getByRole('tab', { name: /Gaslight/i }).click()
    const stage = page.getByTestId('active-reading-room')
    await expect(stage).toHaveAttribute('data-active-skin', 'umbra')
    await expect(stage.getByRole('heading', { name: 'The Gaslight room' })).toBeVisible()
    await expect(stage.getByTestId('landing-desktop-screen')).toBeVisible()
    await expect(stage.getByTestId('landing-mobile-screen')).toBeVisible()

    await stage.getByRole('button', { name: 'Day' }).click()
    await expect(stage).toHaveAttribute('data-active-mode', 'light')

    await rooms.getByRole('tab', { name: /Gaslight/i }).press('ArrowRight')
    await expect(stage).toHaveAttribute('data-active-skin', 'folio')
    await expect(rooms.getByRole('tab', { name: /Marginalia/i })).toBeFocused()
  })
})
