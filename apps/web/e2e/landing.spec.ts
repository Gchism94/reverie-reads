import { expect, test } from '@playwright/test'

test.describe('signed-out landing', () => {
  test('sample scopes, saving, and starting work without an account or persistent writes', async ({
    page,
  }) => {
    const writes: string[] = []
    page.on('request', (request) => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`)
      }
    })
    await page.goto('/')
    const demo = page.getByRole('region', { name: 'A place to start' })
    const atlas = demo.getByRole('article', { name: 'The Lantern Atlas' })
    const planet = demo.getByRole('article', { name: 'Notes from a Quiet Planet' })
    await expect(demo.getByRole('article')).toHaveCount(2)
    await expect(planet).toContainText('borrowed')
    await atlas.getByRole('button', { name: 'Save for later' }).click()
    await expect(demo.getByRole('status')).toContainText(
      'Saved The Lantern Atlas for later in this sample.',
    )
    await expect(demo.getByText('Saved for later:', { exact: true }).locator('..')).toContainText(
      'The Lantern Atlas',
    )
    await planet.getByRole('button', { name: 'Start reading' }).click()
    await expect(planet).toHaveCount(0)
    await expect(demo.getByRole('heading', { name: 'A place to start' })).toBeFocused()
    await expect(demo.getByText('Reading now:', { exact: true }).locator('..')).toContainText(
      'Notes from a Quiet Planet',
    )
    await demo.getByRole('combobox', { name: 'Choose from' }).selectOption('wishlist')
    await expect(demo.getByRole('article')).toHaveCount(1)
    await expect(demo.getByRole('article', { name: 'A Garden in Winter' })).toContainText(
      'wishlist',
    )
    await demo.getByRole('button', { name: 'Reset sample' }).click()
    await expect(demo.getByRole('article')).toHaveCount(2)
    await expect(demo.getByText('Reading now:', { exact: true })).toHaveCount(0)
    await expect(demo.getByText('Saved for later:', { exact: true })).toHaveCount(0)
    await atlas.getByRole('button', { name: 'Start reading' }).click()
    await page.reload()
    await expect(demo.getByRole('article')).toHaveCount(2)
    await expect(demo.getByText('Reading now:', { exact: true })).toHaveCount(0)
    expect(writes).toEqual([])
  })

  test('tells the shipped product story and preserves explicit auth destinations', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { level: 1, name: 'Find your next read in your own library.' }),
    ).toBeVisible()
    await expect(page.getByTestId('landing-desktop-screen').first()).toBeVisible()
    await expect(page.getByTestId('landing-mobile-screen').first()).toBeVisible()
    for (const heading of [
      'Find a room that feels like you.',
      'Keep what the book leaves with you.',
      'A few books. A place to begin.',
    ]) {
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeAttached()
    }

    await expect(page.getByRole('link', { name: 'Start your library' }).first()).toHaveAttribute(
      'href',
      '/auth?mode=signup',
    )
    await expect(page.getByRole('link', { name: 'Return to Reverie' })).toHaveAttribute(
      'href',
      '/auth?mode=signin',
    )

    await expect(page).toHaveTitle('Reverie — Find your next read in your own library')
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /books you own or have borrowed/i,
    )
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://reveriereads.app/reverie-next-read-share.png',
    )

    const shareSize = await page.evaluate(async () => {
      const image = new Image()
      const loaded = new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => reject(new Error('share preview did not load')), {
          once: true,
        })
      })
      image.src = '/reverie-next-read-share.png'
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
    await page.getByRole('heading', { name: 'Your next read may already be waiting.' }).waitFor({
      state: 'attached',
    })

    const nav = page.getByRole('navigation', { name: 'Landing', exact: true })
    const menu = nav.getByRole('button', { name: 'Menu' })
    await expect(menu).toBeVisible()
    expect(await menu.boundingBox()).toMatchObject({ width: 44, height: 44 })

    await menu.click()
    await expect(nav.getByRole('link', { name: 'Rooms' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'How it works' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Log in' })).toBeVisible()
    await menu.click()

    for (const viewport of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width: viewport, height: 844 })
      const width = await page.evaluate(() => ({
        viewport: window.innerWidth,
        root: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }))
      expect(width).toEqual({ viewport, root: viewport, body: viewport })
    }
  })

  test('reduced motion keeps the page still without removing its story', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')

    await expect(
      page.getByRole('heading', { name: 'Find a room that feels like you.' }),
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

test('room selection reaches earlier examples, changes real cover structures, and keeps sample state', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const demo = page.getByRole('region', { name: 'A place to start' })
  await demo
    .getByRole('article', { name: 'The Lantern Atlas' })
    .getByRole('button', { name: 'Save for later' })
    .click()
  await page.getByRole('tab', { name: /Aphelion/ }).click()
  const examples = page.getByTestId('room-example')
  await expect(examples).toHaveCount(3)
  for (const example of await examples.all())
    await expect(example).toHaveAttribute('data-skin', 'aphelion')
  await expect(demo.getByRole('img', { name: /The Lantern Atlas.*placeholder/ })).toContainText(
    'APH·',
  )
  await expect(demo.getByText('Saved for later:', { exact: true }).locator('..')).toContainText(
    'The Lantern Atlas',
  )
  await page.getByTestId('active-reading-room').getByRole('button', { name: 'Night' }).click()
  for (const example of await examples.all())
    await expect(example).toHaveAttribute('data-mode', 'dark')
  const still = await examples
    .first()
    .locator('canvas')
    .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL())
  await page.waitForTimeout(350)
  expect(
    await examples
      .first()
      .locator('canvas')
      .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL()),
  ).toBe(still)
})
