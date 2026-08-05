import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { authFailure } from './support/authError'
import { keepOfflineCacheEmpty } from './support/offlineCache'
import { ok, okUser } from './support/ok'

// REACHABILITY + INVARIANCE for the in-row magnification shelf (fix/spine-inrow-magnify).
//
// The failure history this suite guards, in one paragraph: the reveal's first mechanism (in-flow
// swap) mutated scrollWidth mid-gesture so momentum computed against a moving track; the second
// (absolute overlay) buried siblings' tap targets by construction; the third (shared sticky band)
// was rejected on device for divorcing the reveal from the shelf. The fourth — dock-style
// transform choreography with RESERVED SLACK — is only sound if two things hold forever: layout
// never moves (per-frame scrollWidth constancy, because in Blink/WebKit a transformed box crossing
// the END edge extends scrollable overflow, CSSWG #9458), and nothing is ever buried (displaced
// neighbours stay tappable where they visibly are). Those are exactly the assertions here.
//
// What is asserted, per shelf size {1, 2, 3, 6, 36}:
//   · PER-FRAME INVARIANCE (the load-bearing one): scrollWidth and scrollHeight sampled every
//     animation frame across a scripted end-to-end sweep AND a real-momentum CDP fling AND pick
//     transitions at both extremes — a single value each, to the pixel.
//   · SCROLL REACH: sweeping scrollLeft 0→max makes EVERY book the pick, and the exact extremes
//     pick the exact terminal books (the sliding anchor, carried through all three mechanisms).
//   · TAP REACH: every spine is hittable by REAL coordinate taps (which fail on a buried target —
//     dispatchEvent passes through occluders and proves nothing) and opens its own book.
//   · MAGNIFIED GEOMETRY: the picked spine's transformed box reaches cover scale; a spine far
//     from the anchor rests within ±1px of its natural width (density: the shelf still reads as
//     a shelf); the displaced immediate neighbour of a magnified pick is tappable and opens the
//     NEIGHBOUR.
//   · REDUCED MOTION: under prefers-reduced-motion the wave is binary — picked at full scale,
//     everything else exactly at rest.

const SUPABASE_URL = 'http://127.0.0.1:55321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const EMAIL = 'spine-reachability-e2e@reverie.local'
const PASSWORD = 'spine-reachability-e2e-password'
// Duplicated from SpineShelf deliberately — a silent change to the magnified size should fail here.
const MAG_W = 120
const MAG_H = 176

test.describe.configure({ mode: 'serial' })

type Ctx = {
  session: { access_token: string; refresh_token: string }
  shelves: { name: string; listId: string; count: number; bookIds: string[] }[]
}
let ctx: Ctx | null = null

async function setup(): Promise<Ctx> {
  if (ctx) return ctx
  const admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data } = await admin.auth.admin.listUsers()
  let uid = data?.users?.find((u) => u.email === EMAIL)?.id
  if (!uid) {
    uid = (
      await okUser(
        admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true }),
        'reachability createUser',
      )
    ).id
  }
  await ok(
    admin
      .from('profiles')
      .upsert({ id: uid, display_name: 'Reachability E2E', skin: 'tryst', mode: 'dark' }),
    'reachability profiles upsert',
  )
  await ok(admin.from('list_items').delete().eq('owner_id', uid), 'reachability items delete')
  await ok(admin.from('lists').delete().eq('owner_id', uid), 'reachability lists delete')
  await ok(admin.from('books').delete().eq('owner_id', uid), 'reachability books delete')

  const rows = Array.from({ length: 36 }, (_, i) => ({
    owner_id: uid,
    title: `Reach Probe ${String(i + 1).padStart(2, '0')}`,
    author_first: 'Nell',
    author_last: 'Marrow',
    genre: 'fantasy',
    status: 'standalone',
    ownership: 'owned',
    borrowed: false,
    wishlist: false,
    read_status: 'Read',
    cover_url: `https://covers.reach.test/${i + 1}.jpg`,
  }))
  const { error: insertError } = await admin.from('books').insert(rows)
  if (insertError) throw new Error(`reachability seed failed: ${JSON.stringify(insertError)}`)
  const { data: books } = await admin.from('books').select('id').eq('owner_id', uid).order('title')
  const ids = (books as { id: string }[]).map((b) => b.id)

  const shelves: Ctx['shelves'] = []
  let sort = 0
  for (const count of [1, 2, 3, 6, 36]) {
    const name = `Reach ${count}`
    const { data: list, error: listError } = await admin
      .from('lists')
      .insert({ owner_id: uid, name, kind: 'collection', sort_order: ++sort })
      .select('id')
      .single()
    if (listError || !list) throw new Error(`reachability list: ${JSON.stringify(listError)}`)
    const listId = (list as { id: string }).id
    const bookIds = ids.slice(0, count)
    await ok(
      admin.from('list_items').insert(
        bookIds.map((id, i) => ({
          list_id: listId,
          book_id: id,
          owner_id: uid,
          position: i + 1,
        })),
      ),
      'reachability list_items insert',
    )
    shelves.push({ name, listId, count, bookIds })
  }
  const sb = createClient(SUPABASE_URL, ANON)
  const { data: s, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error || !s.session) throw new Error(authFailure('reachability', EMAIL, error))
  ctx = { session: s.session, shelves }
  return ctx
}

async function signInOnce(page: Page) {
  const c = await setup()
  await keepOfflineCacheEmpty(page)
  await page.addInitScript(() => localStorage.setItem('reverie.onboarded', '1'))
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  )
  await page.route('**covers.reach.test**', (r) =>
    r.fulfill({ body: png, contentType: 'image/png' }),
  )
  for (const p of ['search', 'enrich', 'embed', 'releases', 'series', 'covers'])
    await page.route(`**/functions/v1/${p}**`, (r) => r.fulfill({ json: {} }))
  await page.goto(
    `/#access_token=${c.session.access_token}&refresh_token=${c.session.refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`,
  )
  await page.getByRole('button', { name: /enter your library/i }).click({ timeout: 20_000 })
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 20_000 })
}

async function gotoShelf(page: Page, listId: string, count: number) {
  await page.goto(`/shelf/${listId}`)
  await expect(page.locator('[data-spine]')).toHaveCount(count, { timeout: 20_000 })
  await page.waitForTimeout(500)
  // Park the cursor off the shelf: a hover PINS the pick (onPointerEnter, mouse), by design for
  // real mouse users, and Playwright's click leaves the mouse where it last clicked.
  await page.mouse.move(2, 2)
  await page.waitForTimeout(120)
}

const track = (page: Page) =>
  page
    .locator('[data-spine]')
    .first()
    .locator('xpath=ancestor::div[contains(@class,"overflow-x-auto")]')

const pickedId = (page: Page) => page.locator('[data-spine-picked]').getAttribute('data-spine')

/** Arm a per-animation-frame sampler of the track's scrollWidth/scrollHeight. */
async function armSampler(page: Page) {
  await page.evaluate(() => {
    const el = [...document.querySelectorAll<HTMLElement>('div')].find(
      (d) => getComputedStyle(d).overflowX === 'auto' && d.querySelector('[data-spine]'),
    )!
    const w = window as unknown as { __frames: [number, number][]; __stop: boolean }
    w.__frames = []
    w.__stop = false
    const tick = () => {
      if (w.__stop) return
      w.__frames.push([el.scrollWidth, el.scrollHeight])
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

async function harvestSampler(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __frames: [number, number][]; __stop: boolean }
    w.__stop = true
    return {
      frames: w.__frames.length,
      widths: [...new Set(w.__frames.map((f) => f[0]))],
      heights: [...new Set(w.__frames.map((f) => f[1]))],
    }
  })
}

test('per-frame invariance: scrollWidth and scrollHeight never move — sweep, fling, extremes', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const c = await setup()
  const big = c.shelves.find((s) => s.count === 36)!
  await signInOnce(page)
  await gotoShelf(page, big.listId, 36)

  // Scripted end-to-end sweep and back, sampling every frame. The magnification wave crosses
  // every slot boundary twice; any transformed box escaping the reserved slack shows up as a
  // second width value.
  await armSampler(page)
  await track(page).evaluate(async (el) => {
    const max = el.scrollWidth - el.clientWidth
    for (let x = 0; x <= max; x += 6) {
      el.scrollLeft = x
      await new Promise((r) => requestAnimationFrame(r))
    }
    for (let x = max; x >= 0; x -= 6) {
      el.scrollLeft = x
      await new Promise((r) => requestAnimationFrame(r))
    }
  })
  const sweep = await harvestSampler(page)
  expect(sweep.frames).toBeGreaterThan(100)
  expect(sweep.widths, `sweep widths: ${sweep.widths.join()}`).toHaveLength(1)
  expect(sweep.heights, `sweep heights: ${sweep.heights.join()}`).toHaveLength(1)

  // A real-momentum fling (the gesture-audit method): CDP synthesizes the touch drag and the
  // compositor continues with momentum. This is the exact gesture class the first mechanism broke.
  const y = await track(page).evaluate((el) => {
    const r = el.getBoundingClientRect()
    return Math.round(r.y + r.height / 2)
  })
  const cdp = await page.context().newCDPSession(page)
  await armSampler(page)
  await cdp.send('Input.synthesizeScrollGesture', {
    x: 200,
    y,
    xDistance: -300,
    yDistance: 0,
    speed: 2500,
    preventFling: false,
    gestureSourceType: 'touch',
  })
  await page.waitForTimeout(1500)
  await cdp.send('Input.synthesizeScrollGesture', {
    x: 200,
    y,
    xDistance: 300,
    yDistance: 0,
    speed: 2500,
    preventFling: false,
    gestureSourceType: 'touch',
  })
  await page.waitForTimeout(1500)
  const fling = await harvestSampler(page)
  expect(fling.frames).toBeGreaterThan(50)
  expect(fling.widths, `fling widths: ${fling.widths.join()}`).toHaveLength(1)
  expect(fling.widths[0], 'fling and sweep must see the same track').toBe(sweep.widths[0])

  // Pick transitions at both extremes — where the magnified boxes press hardest on the edges.
  await armSampler(page)
  await track(page).evaluate((el) => (el.scrollLeft = 0))
  await expect.poll(async () => pickedId(page)).toBe(big.bookIds[0])
  await track(page).evaluate((el) => (el.scrollLeft = el.scrollWidth))
  await expect.poll(async () => pickedId(page)).toBe(big.bookIds[35])
  const extremes = await harvestSampler(page)
  expect(extremes.widths, `extreme widths: ${extremes.widths.join()}`).toHaveLength(1)

  // BOTH magnified terminals must sit fully INSIDE the track's box — the slack absorbing them is
  // the mechanism, this is the observable, and it is asserted SYMMETRICALLY. The first version of
  // this assertion measured only the RIGHT terminal, which is exactly how the left terminal
  // shipped able to clip on device (fix/spine-magnify-tracking): the START edge trims overhang
  // instead of extending scrollWidth, so the invariance sampler is structurally blind there and
  // only a direct geometric check can see it.
  await track(page).evaluate((el) => (el.scrollLeft = 0))
  await expect.poll(async () => pickedId(page)).toBe(big.bookIds[0])
  await page.waitForTimeout(300) // let the settle animation finish before measuring
  const leftOverhang = await track(page).evaluate((el) => {
    const first = el.querySelector<HTMLElement>('[data-spine]')!
    return Math.round(first.getBoundingClientRect().left - el.getBoundingClientRect().left)
  })
  expect(
    leftOverhang,
    'magnified LEFT terminal must not cross the start edge',
  ).toBeGreaterThanOrEqual(0)
  await track(page).evaluate((el) => (el.scrollLeft = el.scrollWidth))
  await expect.poll(async () => pickedId(page)).toBe(big.bookIds[35])
  await page.waitForTimeout(300)
  const rightOverhang = await track(page).evaluate((el) => {
    const spines = el.querySelectorAll<HTMLElement>('[data-spine]')
    const last = spines[spines.length - 1]!
    return Math.round(last.getBoundingClientRect().right - el.getBoundingClientRect().right)
  })
  expect(rightOverhang, 'magnified RIGHT terminal must not cross the end edge').toBeLessThanOrEqual(
    0,
  )
})

test('scroll reach: sweeping picks EVERY book, and the extremes pick the terminals', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const c = await setup()
  const big = c.shelves.find((s) => s.count === 36)!
  await signInOnce(page)
  await gotoShelf(page, big.listId, 36)

  await track(page).evaluate((el) => (el.scrollLeft = 0))
  await expect.poll(async () => pickedId(page)).toBe(big.bookIds[0])
  await track(page).evaluate((el) => (el.scrollLeft = el.scrollWidth))
  await expect.poll(async () => pickedId(page)).toBe(big.bookIds[35])

  const seen = await track(page).evaluate(async (el) => {
    const out = new Set<string>()
    const max = el.scrollWidth - el.clientWidth
    const steps = 120
    for (let i = 0; i <= steps; i++) {
      el.scrollLeft = Math.round((max * i) / steps)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const id = el.querySelector<HTMLElement>('[data-spine-picked]')?.dataset.spine
      if (id) out.add(id)
    }
    return [...out]
  })
  const missing = big.bookIds.filter((id) => !seen.includes(id))
  expect(missing, `books never scroll-picked (count ${missing.length})`).toEqual([])

  // The scroll-picked terminal book OPENS from its magnified state — reach means picked AND
  // openable. The picked button IS the tap target now (one element per book).
  await track(page).evaluate((el) => (el.scrollLeft = el.scrollWidth))
  await expect.poll(async () => pickedId(page)).toBe(big.bookIds[35])
  await page.locator('[data-spine-picked]').click({ timeout: 5_000 })
  await expect(page).toHaveURL(new RegExp(`/book/${big.bookIds[35]}`))
})

test('tap reach: on every tiny shelf, EVERY spine is hittable and its book opens', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const c = await setup()
  await signInOnce(page)

  // Real coordinate taps/clicks hit-test like a finger: a buried spine throws on interception,
  // which is exactly the reachability failure this exists to catch (and exactly what the
  // wrapper-transform draft of this mechanism DID fail before the transform moved to the button —
  // the button's reported box disagreed with its visuals, and the runner aimed at a spot the
  // magnified neighbour painted over). Short timeouts keep a mutant run's failure fast.
  const hasTouch = !!test.info().project.use.hasTouch
  for (const shelf of c.shelves.filter((s) => s.count <= 6)) {
    for (const bookId of shelf.bookIds) {
      await gotoShelf(page, shelf.listId, shelf.count)
      const spine = page.locator(`[data-spine="${bookId}"]`)
      if (hasTouch) await spine.tap({ timeout: 5_000 })
      else await spine.click({ timeout: 5_000 })
      await page.waitForTimeout(200)
      if (!/\/book\//.test(page.url())) {
        await expect.poll(async () => pickedId(page)).toBe(bookId)
        // Second activation of the SAME element opens — one element per book again.
        if (hasTouch) await spine.tap({ timeout: 5_000 })
        else await spine.click({ timeout: 5_000 })
      }
      await expect(page).toHaveURL(new RegExp(`/book/${bookId}`), { timeout: 10_000 })
    }
  }
})

test('magnified geometry: cover scale at the pick, rest density elsewhere, neighbours tappable', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const c = await setup()
  const big = c.shelves.find((s) => s.count === 36)!
  await signInOnce(page)
  await gotoShelf(page, big.listId, 36)

  // Anchor mid-track so the wave is fully interior.
  await track(page).evaluate((el) => {
    el.scrollLeft = Math.round((el.scrollWidth - el.clientWidth) / 2)
  })
  await page.waitForTimeout(400)
  const geom = await track(page).evaluate((el) => {
    const picked = el.querySelector<HTMLElement>('[data-spine-picked]')!
    const spines = [...el.querySelectorAll<HTMLElement>('[data-spine]')]
    const iPicked = spines.indexOf(picked)
    const far = spines[iPicked >= 18 ? iPicked - 10 : iPicked + 10]!
    const neighbour = spines[iPicked + 1] ?? spines[iPicked - 1]!
    const trackRect = el.getBoundingClientRect()
    // visual-vs-natural centre shift of the two immediate neighbours, sign included
    const shift = (sp: HTMLElement) => {
      const r = sp.getBoundingClientRect()
      const visualCentre = r.left + r.width / 2
      const naturalCentre = trackRect.left - el.scrollLeft + sp.offsetLeft + sp.offsetWidth / 2
      return Math.round(visualCentre - naturalCentre)
    }
    return {
      pickedVisualW: Math.round(picked.getBoundingClientRect().width),
      farVisualW: far.getBoundingClientRect().width,
      farNaturalW: far.offsetWidth,
      neighbourId: neighbour.dataset.spine!,
      leftShift: iPicked > 0 ? shift(spines[iPicked - 1]!) : null,
      rightShift: iPicked < spines.length - 1 ? shift(spines[iPicked + 1]!) : null,
    }
  })
  // The picked spine reaches cover scale (rounding tolerance 2px)…
  expect(
    Math.abs(geom.pickedVisualW - MAG_W),
    `picked width ${geom.pickedVisualW}`,
  ).toBeLessThanOrEqual(2)
  // …a spine 10 slots away rests at natural width ±1px (density holds)…
  expect(
    Math.abs(geom.farVisualW - geom.farNaturalW),
    `rest width ${geom.farVisualW} vs natural ${geom.farNaturalW}`,
  ).toBeLessThanOrEqual(1)
  // …displacement SPLITS around the pick: the left neighbour moves LEFT and the right neighbour
  // moves RIGHT. This is asserted directly rather than via scrollWidth because the reserved slack
  // is deliberately generous (96px) — generous enough that even a fully one-sided push can hide
  // inside it, which a mutant run proved: naive rightward displacement SURVIVED the invariance
  // assertion. Symmetry is the property; this is its direct observation.
  expect(geom.leftShift, `left neighbour shift ${geom.leftShift}`).toBeLessThanOrEqual(-4)
  expect(geom.rightShift, `right neighbour shift ${geom.rightShift}`).toBeGreaterThanOrEqual(4)
  // The discriminator is SHARE, not pixel symmetry: hash-varied spine widths make the halves
  // genuinely unequal (clean ratios observed across projects/seeds: 0.58, 0.29, 0.24), but under
  // a correct split BOTH sides carry a real fraction of the displacement, while the
  // naive-rightward-push mutant sends ~93% one way (measured ratios 0.076-0.09). The 0.15 bound
  // sits between the two regimes with margin on both sides.
  const lo = Math.min(Math.abs(geom.leftShift!), Math.abs(geom.rightShift!))
  const hi = Math.max(Math.abs(geom.leftShift!), Math.abs(geom.rightShift!))
  expect(
    lo / hi,
    `displacement must SPLIT to both sides (left ${geom.leftShift}, right ${geom.rightShift})`,
  ).toBeGreaterThanOrEqual(0.15)

  // …and the displaced immediate neighbour is tappable where it visibly is, opening the NEIGHBOUR
  // (displacement, not burial — the defect class of mechanism two).
  const neighbourId = geom.neighbourId
  const spine = page.locator(`[data-spine="${neighbourId}"]`)
  await spine.click({ timeout: 5_000 })
  await page.waitForTimeout(200)
  if (!/\/book\//.test(page.url())) {
    await expect.poll(async () => pickedId(page)).toBe(neighbourId)
    await spine.click({ timeout: 5_000 })
  }
  await expect(page).toHaveURL(new RegExp(`/book/${neighbourId}`), { timeout: 10_000 })
})

test('reduced motion: the wave is binary — picked at full scale, the rest exactly at rest', async ({
  page,
}) => {
  const c = await setup()
  const big = c.shelves.find((s) => s.count === 36)!
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signInOnce(page)
  await gotoShelf(page, big.listId, 36)
  await track(page).evaluate((el) => {
    el.scrollLeft = Math.round((el.scrollWidth - el.clientWidth) / 2)
  })
  await page.waitForTimeout(400)
  const state = await track(page).evaluate((el) => {
    const picked = el.querySelector<HTMLElement>('[data-spine-picked]')!
    const spines = [...el.querySelectorAll<HTMLElement>('[data-spine]')]
    const iPicked = spines.indexOf(picked)
    const neighbour = spines[iPicked + 1] ?? spines[iPicked - 1]!
    return {
      pickedW: Math.round(picked.getBoundingClientRect().width),
      neighbourVisualW: neighbour.getBoundingClientRect().width,
      neighbourNaturalW: neighbour.offsetWidth,
    }
  })
  expect(Math.abs(state.pickedW - MAG_W)).toBeLessThanOrEqual(2)
  // The IMMEDIATE neighbour — mid-wave under normal motion — must be exactly at rest.
  expect(Math.abs(state.neighbourVisualW - state.neighbourNaturalW)).toBeLessThanOrEqual(1)
})

test('cover aspect: the rendered cover box keeps the cover ratio at every visible wave position', async ({
  page,
}) => {
  // fix/spine-magnify-geometry, defect 1. The button's scale is non-uniform by necessity (spine
  // ratio → cover ratio), and the first implementation let the cover inherit it: every visible
  // wave position except exactly t=1 rendered the bitmap squat (measured 0.45 vs 0.68 intrinsic
  // mid-glide) with object-cover then cropping mid-image into the wrong-ratio box. The invariant:
  // the cover's rendered box holds the 120:176 cover ratio within 1% WHENEVER it is visible —
  // rest, mid-glide, settled — because object-cover renders the bitmap undistorted exactly when
  // its box is at the intended ratio.
  test.setTimeout(120_000)
  const c = await setup()
  const big = c.shelves.find((s) => s.count === 36)!
  await signInOnce(page)
  await gotoShelf(page, big.listId, 36)
  const INTRINSIC = MAG_W / MAG_H

  // Settled at an interior pick: exactly full cover size, exact ratio.
  await track(page).evaluate((el) => {
    el.scrollLeft = Math.round((el.scrollWidth - el.clientWidth) / 2)
  })
  await page.waitForTimeout(450)
  const settled = await track(page).evaluate((el) => {
    const cover = el.querySelector<HTMLElement>('[data-spine-picked] [data-mag-cover]')!
    const r = cover.getBoundingClientRect()
    return { w: r.width, h: r.height, opacity: getComputedStyle(cover).opacity }
  })
  expect(Number(settled.opacity)).toBeGreaterThan(0.95)
  expect(Math.abs(settled.w - MAG_W), `settled cover width ${settled.w}`).toBeLessThanOrEqual(2)
  expect(Math.abs(settled.h - MAG_H), `settled cover height ${settled.h}`).toBeLessThanOrEqual(2)

  // Mid-glide: every cover that is at all visible, on every sampled frame of a scripted drag.
  const glide = await track(page).evaluate(async (el) => {
    const ratios: number[] = []
    const max = el.scrollWidth - el.clientWidth
    for (let x = Math.round(max * 0.25); x <= Math.round(max * 0.6); x += 6) {
      el.scrollLeft = x
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      for (const cov of el.querySelectorAll<HTMLElement>('[data-mag-cover]')) {
        if (parseFloat(getComputedStyle(cov).opacity) > 0.05) {
          const r2 = cov.getBoundingClientRect()
          if (r2.height > 0) ratios.push(r2.width / r2.height)
        }
      }
    }
    return { n: ratios.length, min: Math.min(...ratios), max: Math.max(...ratios) }
  })
  expect(glide.n).toBeGreaterThan(30)
  expect(
    Math.abs(glide.min / INTRINSIC - 1),
    `squattest mid-glide cover ratio ${glide.min.toFixed(4)} vs intrinsic ${INTRINSIC.toFixed(4)}`,
  ).toBeLessThanOrEqual(0.01)
  expect(
    Math.abs(glide.max / INTRINSIC - 1),
    `stretchiest mid-glide cover ratio ${glide.max.toFixed(4)} vs intrinsic ${INTRINSIC.toFixed(4)}`,
  ).toBeLessThanOrEqual(0.01)

  // Settled after a POINTER pick (the other settle path): same exact box.
  const targetId = await track(page).evaluate((el) => {
    const spines = [...el.querySelectorAll<HTMLElement>('[data-spine]')]
    const picked = el.querySelector<HTMLElement>('[data-spine-picked]')!
    const i = spines.indexOf(picked)
    return spines[i >= 18 ? i - 3 : i + 3]!.dataset.spine!
  })
  const spine = page.locator(`[data-spine="${targetId}"]`)
  if (test.info().project.use.hasTouch) await spine.tap({ timeout: 5_000 })
  else await spine.hover({ timeout: 5_000 })
  await page.waitForTimeout(450)
  await expect.poll(async () => pickedId(page)).toBe(targetId)
  const tapped = await track(page).evaluate((el) => {
    const cover = el.querySelector<HTMLElement>('[data-spine-picked] [data-mag-cover]')!
    const r = cover.getBoundingClientRect()
    return { w: r.width, h: r.height }
  })
  expect(Math.abs(tapped.w - MAG_W), `pointer-picked cover width ${tapped.w}`).toBeLessThanOrEqual(
    2,
  )
  expect(Math.abs(tapped.h - MAG_H), `pointer-picked cover height ${tapped.h}`).toBeLessThanOrEqual(
    2,
  )
})

test('terminal visibility: the magnified box stays inside the VISIBLE track region near both terminals', async ({
  page,
}) => {
  // fix/spine-magnify-geometry, defect 2 — and the green-while-broken lesson: the symmetric
  // terminal assertion above measures at scrollLeft 0 and scrollLeft max, the ONLY two offsets
  // where content space and viewport space coincide. The device clip lived at scrollLeft 55–150:
  // the wave (pinned to the first slot by the #146 terminal clamp) held the magnified box at
  // content x≈55 while the viewport's left edge scrolled past it — inside the content bounds the
  // slack guarantees, outside the region the device renders. Everything here is therefore
  // asserted in VIEWPORT space (getBoundingClientRect, against the track's own client rect) —
  // the space the screen shows — at rest positions strictly between the exact terminals, and on
  // every sampled frame of a mid-glide drag through both terminal regions.
  test.setTimeout(120_000)
  const c = await setup()
  const big = c.shelves.find((s) => s.count === 36)!
  await signInOnce(page)
  await gotoShelf(page, big.listId, 36)
  const TOL = 1.5 // sub-pixel transform rounding

  const maxScroll = await track(page).evaluate((el) => el.scrollWidth - el.clientWidth)
  const restOffsets = [0, 40, 80, 120, maxScroll - 120, maxScroll - 80, maxScroll - 40, maxScroll]
  for (const x of restOffsets) {
    await track(page).evaluate((el, sl) => (el.scrollLeft = sl), x)
    await page.waitForTimeout(450) // past the 140ms idle + 160ms settle
    const box = await track(page).evaluate((el) => {
      const picked = el.querySelector<HTMLElement>('[data-spine-picked]')!
      const pr = picked.getBoundingClientRect()
      const tr = el.getBoundingClientRect()
      return { left: pr.left - tr.left, right: pr.right - tr.right, w: pr.width }
    })
    expect(
      box.left,
      `at rest scrollLeft ${x}: picked box left edge ${box.left.toFixed(1)}px past the visible left edge`,
    ).toBeGreaterThanOrEqual(-TOL)
    expect(
      box.right,
      `at rest scrollLeft ${x}: picked box right edge ${box.right.toFixed(1)}px past the visible right edge`,
    ).toBeLessThanOrEqual(TOL)
  }

  // Mid-glide through both terminal regions: on every sampled frame the MOST-magnified box (the
  // one pressing hardest on the edge) stays inside the visible region.
  const glide = await track(page).evaluate(async (el, tol) => {
    const violations: string[] = []
    let n = 0
    const max = el.scrollWidth - el.clientWidth
    const ranges: [number, number][] = [
      [0, Math.min(240, max)],
      [Math.max(0, max - 240), max],
    ]
    for (const [from, to] of ranges) {
      for (let x = from; x <= to; x += 6) {
        el.scrollLeft = x
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        const tr = el.getBoundingClientRect()
        let best: HTMLElement | null = null
        let bestExcess = 2
        for (const s of el.querySelectorAll<HTMLElement>('[data-spine]')) {
          const excess = s.getBoundingClientRect().width - s.offsetWidth
          if (excess > bestExcess) {
            bestExcess = excess
            best = s
          }
        }
        if (!best) continue
        n++
        const r = best.getBoundingClientRect()
        if (r.left - tr.left < -tol) violations.push(`x=${x} left ${(r.left - tr.left).toFixed(1)}`)
        if (r.right - tr.right > tol)
          violations.push(`x=${x} right ${(r.right - tr.right).toFixed(1)}`)
      }
    }
    return { n, violations }
  }, TOL)
  expect(glide.n).toBeGreaterThan(30)
  expect(
    glide.violations,
    `mid-glide magnified box left the visible region (${glide.violations.length} frames)`,
  ).toEqual([])
})

test('tracking: in motion the wave glides with the continuous anchor, never stepping', async ({
  page,
}) => {
  // The assertion that would have caught the stepping (fix/spine-magnify-tracking). Under the old
  // always-on-the-pick centring the wave's centre sat a measured CONSTANT 156px from the anchor
  // throughout a fling, and stepped slot-to-slot on a drag (p90 deviation 49px, max 147). In the
  // motion regime the wave follows the continuous anchor in the same frame, so its centroid must
  // stay within a tight band of the CLAMPED anchor on every sampled mid-motion frame. The 12px
  // bound is far below half a slot pitch (16-27px), so per-slot stepping cannot pass it.
  test.setTimeout(120_000)
  const c = await setup()
  const big = c.shelves.find((s) => s.count === 36)!
  await signInOnce(page)
  await gotoShelf(page, big.listId, 36)

  const result = await track(page).evaluate(async (el) => {
    const spines = [...el.querySelectorAll<HTMLElement>('[data-spine]')]
    const firstCentre = spines[0]!.offsetLeft + spines[0]!.offsetWidth / 2
    const lastEl = spines[spines.length - 1]!
    const lastCentre = lastEl.offsetLeft + lastEl.offsetWidth / 2
    const devs: number[] = []
    // Continuous scripted drag across the middle half of the track, sampling every frame WHILE
    // scrolling (the motion regime — the settle animation only runs 140ms after the last event).
    // Samples taken after a STALLED iteration are excluded: if the event loop hiccuped past the
    // idle window, the settle regime legitimately cut in and the frame measures the wrong regime —
    // that is scheduling noise, not stepping (it flaked exactly once on clean code under load).
    const max = el.scrollWidth - el.clientWidth
    let prev = performance.now()
    for (let x = Math.round(max * 0.2); x <= Math.round(max * 0.8); x += 5) {
      el.scrollLeft = x
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const now = performance.now()
      const stalled = now - prev > 100
      prev = now
      if (stalled) continue
      const maxScroll = el.scrollWidth - el.clientWidth
      const progress = maxScroll > 0 ? Math.min(1, Math.max(0, el.scrollLeft / maxScroll)) : 0.5
      const anchor = el.scrollLeft + progress * el.clientWidth
      const clamped = Math.min(Math.max(anchor, firstCentre), lastCentre)
      // wave centroid from visual-width excess — the same estimator the audits used
      let num = 0
      let den = 0
      for (const s of spines) {
        const excess = s.getBoundingClientRect().width - s.offsetWidth
        if (excess > 2) {
          num += excess * (s.offsetLeft + s.offsetWidth / 2)
          den += excess
        }
      }
      if (den > 0) devs.push(Math.abs(num / den - clamped))
    }
    devs.sort((a, b) => a - b)
    return {
      n: devs.length,
      p50: Math.round(devs[Math.floor(devs.length * 0.5)]!),
      max: Math.round(devs[devs.length - 1]!),
    }
  })
  expect(result.n).toBeGreaterThan(50)
  expect(
    result.max,
    `wave centre must track the anchor while in motion (p50 ${result.p50}px, max ${result.max}px)`,
  ).toBeLessThanOrEqual(12)
})
