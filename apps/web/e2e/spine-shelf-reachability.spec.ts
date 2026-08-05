import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { authFailure } from './support/authError'
import { keepOfflineCacheEmpty } from './support/offlineCache'
import { ok, okUser } from './support/ok'

// THE NEW ASSERTION CLASS — REACHABILITY: every book on a shelf has some gesture path to being
// revealed AND opened. docs/audits/spine-overlay-clamp.md's key finding was that three audits in
// a row measured whether SCROLLING covers the track (it does) while nobody measured whether the
// PICK covers the shelf (it didn't): the fixed centre anchor could never sit closer than
// clientWidth/2 to either content edge, so the first/last ~3 books of every scrolling shelf were
// permanently un-pickable — and on tiny shelves the 120px reveal buried its sibling's entire tap
// target, leaving that book with NO touch path at all. Both defects are now structurally
// impossible: the sliding anchor reaches every slot, and the reveal has left the row entirely for
// the page's shared band (docs/tasks/task-spine-reveal-band.md), so nothing can bury a spine.
//
// What is asserted, per shelf size {1, 2, 3, 6, 36}:
//   · SCROLL REACH (scrolling shelves): sweeping scrollLeft 0→max makes EVERY book the pick at
//     some position, and the exact extremes pick the exact terminal books.
//   · TAP REACH (all shelves): every spine is genuinely hittable — real coordinate clicks, which
//     hit-test like a finger and FAIL on a buried target (dispatchEvent would pass through an
//     occluder and prove nothing) — and the reveal it produces can then be opened.
//   · TRACK WIDTH (folded in from the deleted invariant guard): the track's scrollWidth does not
//     change across pick transitions. That invariant is now true by construction rather than by
//     design — nothing is rendered in the track per pick at all — but it is the property whose
//     violation started this whole arc, so it keeps an assertion.
//   · SHARED BAND OWNERSHIP (multi-rail /shelves): the one band on the page follows the
//     last-touched rail, holds its cover when that rail leaves the viewport, and never changes
//     height. Every pre-existing fixture here is a SINGLE-rail page, where shared and per-rail
//     rendering are indistinguishable — so an ownership bug was invisible to this entire suite
//     until the multi-rail fixture below.
//
// Environment honesty: this proves reachability under synthetic input — coordinates, hit-testing,
// and pick arithmetic. It does not prove the *feel* of the sliding anchor under a real finger.
// One earlier belief was falsified while building this: Chromium's touch emulation DOES fire a
// full pointerleave chain after tap-release (an instrumented probe logged it reaching the track),
// which is why onPointerLeave's clear is now mouse-only — tap-to-OPEN was racing the leave's
// state flush against the tap's trailing click. iOS's exact ordering is still a device check,
// named in the branch report, but the fix makes the answer non-load-bearing.

const SUPABASE_URL = 'http://127.0.0.1:55321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const EMAIL = 'spine-reachability-e2e@reverie.local'
const PASSWORD = 'spine-reachability-e2e-password'

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

  const rows = Array.from({ length: 80 }, (_, i) => ({
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
  // 1/2/3/6/36 are the single-page reachability fixtures. LEFT and RIGHT are DISJOINT slices, used
  // only by the multi-rail ownership tests: with overlapping rails a band showing "the right book"
  // proves nothing, because both rails can legitimately pick the same title.
  // 40 books each, so both rails OVERFLOW at the desktop project's 1280px too — a rail that fits
  // its viewport has zero scroll range, fires no scroll event, and cannot claim the band, which
  // would make this suite silently untested on `rest` rather than failing.
  const slices: Record<string, [number, number]> = {
    'Reach Left': [0, 40],
    'Reach Right': [40, 80],
  }
  for (const count of [1, 2, 3, 6, 36, 'Reach Left', 'Reach Right'] as const) {
    const name = typeof count === 'number' ? `Reach ${count}` : count
    const { data: list, error: listError } = await admin
      .from('lists')
      .insert({ owner_id: uid, name, kind: 'collection', sort_order: ++sort })
      .select('id')
      .single()
    if (listError || !list) throw new Error(`reachability list: ${JSON.stringify(listError)}`)
    const listId = (list as { id: string }).id
    const slice = typeof count === 'number' ? ([0, count] as const) : slices[count]!
    const bookIds = ids.slice(slice[0], slice[1])
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
    shelves.push({ name, listId, count: bookIds.length, bookIds })
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
  // Park the cursor off the shelf. Playwright's click leaves the mouse hovering where it last
  // clicked, and a hover PINS the reveal (onPointerEnter, mouse → pointerId) — by design for real
  // mouse users, but here it would freeze the reveal against every scroll-driven assertion that
  // follows. This is test hygiene, not a workaround for a defect.
  await page.mouse.move(2, 2)
  await page.waitForTimeout(120)
}

const track = (page: Page) =>
  page
    .locator('[data-spine]')
    .first()
    .locator('xpath=ancestor::div[contains(@class,"overflow-x-auto")]')

const revealedId = (page: Page) =>
  page.locator('[data-spine-reveal]').getAttribute('data-spine-reveal')

test('scroll reach: sweeping the 36-book shelf picks EVERY book, and the extremes pick the terminals', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const c = await setup()
  const big = c.shelves.find((s) => s.count === 36)!
  await signInOnce(page)
  await gotoShelf(page, big.listId, 36)

  // Exact extremes first: scrollLeft 0 must pick the FIRST book, max the LAST — the two positions
  // the old centre anchor could never satisfy (it picked index 3 and 32; audit §4).
  await track(page).evaluate((el) => (el.scrollLeft = 0))
  await expect.poll(async () => revealedId(page)).toBe(big.bookIds[0])
  await track(page).evaluate((el) => (el.scrollLeft = el.scrollWidth))
  await expect.poll(async () => revealedId(page)).toBe(big.bookIds[35])

  // Full sweep: fine steps across [0, max]; every book id must appear as the pick. Step count is
  // generous (3x the book count) so a book whose pick-window is a few px cannot be stepped over.
  const seen = await track(page).evaluate(async (el) => {
    const out = new Set<string>()
    const max = el.scrollWidth - el.clientWidth
    const steps = 120
    for (let i = 0; i <= steps; i++) {
      el.scrollLeft = Math.round((max * i) / steps)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const id = document.querySelector<HTMLElement>('[data-spine-reveal]')?.dataset.spineReveal
      if (id) out.add(id)
    }
    return [...out]
  })
  const missing = big.bookIds.filter((id) => !seen.includes(id))
  expect(missing, `books never scroll-picked (count ${missing.length})`).toEqual([])

  // The scroll-picked terminal book OPENS from its reveal — reach means revealed AND openable.
  await track(page).evaluate((el) => (el.scrollLeft = el.scrollWidth))
  await expect.poll(async () => revealedId(page)).toBe(big.bookIds[35])
  await page.locator('[data-spine-reveal]').click()
  await expect(page).toHaveURL(new RegExp(`/book/${big.bookIds[35]}`))
})

test('tap reach: on every tiny shelf, EVERY spine is hittable and its book opens', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const c = await setup()
  await signInOnce(page)

  // On the mobile project a real tap() (no hover) exercises the touch path: first tap reveals,
  // second opens. On desktop, click() hovers first — the hover itself reveals, so one click can
  // open directly. Both are legitimate gesture paths; the branch below accepts whichever ran and
  // pins the destination either way. What both share, and what the mutant must break: the
  // interaction is a REAL coordinate hit-test, so a buried spine (a sibling's reveal painted over
  // its whole tap target) throws on interception — exactly the reachability failure this guard
  // exists to catch. Short timeouts keep a mutant run's failure fast.
  const hasTouch = !!test.info().project.use.hasTouch
  for (const shelf of c.shelves.filter((s) => /^Reach \d+$/.test(s.name) && s.count <= 6)) {
    for (const bookId of shelf.bookIds) {
      await gotoShelf(page, shelf.listId, shelf.count)
      const spine = page.locator(`[data-spine="${bookId}"]`)
      if (hasTouch) await spine.tap({ timeout: 5_000 })
      else await spine.click({ timeout: 5_000 })
      await page.waitForTimeout(200)
      if (!/\/book\//.test(page.url())) {
        await expect.poll(async () => revealedId(page)).toBe(bookId)
        const overlay = page.locator('[data-spine-reveal]')
        if (hasTouch) await overlay.tap({ timeout: 5_000 })
        else await overlay.click({ timeout: 5_000 })
      }
      await expect(page).toHaveURL(new RegExp(`/book/${bookId}`), { timeout: 10_000 })
    }
  }
})

test('track width does not change across pick transitions', async ({ page }) => {
  // Folded in from the deleted spine-shelf-invariant.spec.ts. That file's other assertions —
  // clamp bounds, slot-vs-container anchoring — described machinery this branch removed, and a
  // guard that passes because it tests nothing is the failure mode this arc exists to name. The
  // width invariant itself survives: it is what the original defect violated (the in-flow reveal
  // breathed the track 70-80px mid-gesture, docs/audits/mobile-shelf-interaction.md), and it is
  // now true by construction because nothing renders in the track per pick at all.
  test.setTimeout(120_000)
  const c = await setup()
  const big = c.shelves.find((s) => s.name === 'Reach 36')!
  await signInOnce(page)
  await gotoShelf(page, big.listId, 36)

  const widths = await track(page).evaluate(async (el) => {
    const out: number[] = []
    const max = el.scrollWidth - el.clientWidth
    for (let i = 0; i <= 24; i++) {
      el.scrollLeft = Math.round((max * i) / 24)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      out.push(el.scrollWidth)
    }
    return out
  })
  expect(
    new Set(widths).size,
    `track width moved across picks: ${[...new Set(widths)].join()}`,
  ).toBe(1)
})

/** The two disjoint collection rails on /shelves, as { railAttr, bookIds } pairs. */
async function multiRail(page: Page, c: Ctx) {
  await page.goto('/shelves')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
  // Collections are behind a disclosure that APPENDS its rails to the same document.
  const disclosure = page.getByRole('button', { name: /^Collections$/i })
  if (await disclosure.count()) await disclosure.first().click()
  await page.waitForTimeout(1200)
  await page.mouse.move(2, 2)
  await page.waitForTimeout(150)

  // Match a rail by its EXACT spine set, not by "contains book X": /shelves stacks the derived
  // rails above the collections and every fixture collection is a slice of the same 36 books, so
  // any single book appears in half a dozen rails. The disjoint 12-book slices are unique as sets.
  const pick = async (name: string) => {
    const shelf = c.shelves.find((s) => s.name === name)!
    const attr = await page.evaluate((want: string[]) => {
      const rails = [...document.querySelectorAll<HTMLElement>('[data-rail]')]
      const target = rails.find((r) => {
        const ids = [...r.querySelectorAll<HTMLElement>('[data-spine]')].map((s) => s.dataset.spine)
        return ids.length === want.length && want.every((w) => ids.includes(w))
      })
      return target?.dataset.rail ?? null
    }, shelf.bookIds)
    if (!attr) throw new Error(`no rail on /shelves holds exactly the books of "${name}"`)
    return { attr, books: shelf.bookIds, rail: page.locator(`[data-rail="${attr}"]`) }
  }
  return { left: await pick('Reach Left'), right: await pick('Reach Right') }
}

const bandOwner = (page: Page) =>
  page.locator('[data-spine-reveal-band]').getAttribute('data-band-owner')
const bandHeight = (page: Page) =>
  page
    .locator('[data-spine-reveal-band]')
    .evaluate((el) => Math.round(el.getBoundingClientRect().height))

test('shared band: one per page, owned by the last-touched rail, constant height', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const c = await setup()
  await signInOnce(page)
  const { left, right } = await multiRail(page, c)

  // ONE band for the whole page. Per-rail rendering — the shape this branch replaced — puts one
  // band under every rail, and this is the assertion that catches it.
  await expect(page.locator('[data-spine-reveal-band]')).toHaveCount(1)
  const h0 = await bandHeight(page)

  // Rail A: scrolling it hands it the band, and the cover is one of ITS books. The two rails hold
  // disjoint books, so "a book from the right set" cannot be satisfied by the wrong rail.
  await left.rail.evaluate((el) => (el.scrollLeft = el.scrollWidth))
  await expect
    .poll(async () => bandOwner(page), { message: 'rail A must own the band' })
    .toBe(left.attr)
  expect(left.books, 'band shows a book from rail A').toContain(await revealedId(page))
  const h1 = await bandHeight(page)

  // Rail B: last-touched-wins hands the band over.
  await right.rail.evaluate((el) => (el.scrollLeft = el.scrollWidth))
  await expect
    .poll(async () => bandOwner(page), { message: 'rail B must own the band' })
    .toBe(right.attr)
  expect(right.books, 'band shows a book from rail B').toContain(await revealedId(page))
  const h2 = await bandHeight(page)

  expect([h0, h1, h2], 'band height must not move across ownership changes').toEqual([h0, h0, h0])
  await expect(page.locator('[data-spine-reveal-band]')).toHaveCount(1)
})

test('shared band: stays in the viewport for a lower rail, holds its cover when its rail leaves, withdraws the caret', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const c = await setup()
  await signInOnce(page)
  const { left, right } = await multiRail(page, c)

  // Work the LOWER of the two rails after scrolling the page: the band must be on screen to serve
  // it. Without sticky positioning the band sits at the document's end, far below the fold.
  await right.rail.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await right.rail.evaluate((el) => (el.scrollLeft = el.scrollWidth))
  await expect.poll(async () => bandOwner(page)).toBe(right.attr)
  const onScreen = await page.locator('[data-spine-reveal-band]').evaluate((el) => {
    const r = el.getBoundingClientRect()
    return r.top < window.innerHeight && r.bottom > 0
  })
  expect(onScreen, 'the band must be visible while a lower rail is being scrolled').toBe(true)

  const held = await revealedId(page)
  const caretOpacity = () =>
    page
      .locator('[data-spine-reveal-band] span[aria-hidden]')
      .evaluate((el) => (el as HTMLElement).style.opacity)
  await expect
    .poll(caretOpacity, { message: 'caret shows while the owning rail is visible' })
    .toBe('1')

  // HANDOFF RULE (task item 4, argued in the branch report): the band HOLDS the last pick rather
  // than handing off to a visible rail — handing off would invent a pick the reader never made and
  // would make ordinary VERTICAL scrolling churn the band's contents. What it does drop is the
  // caret, because the caret is the claim "this cover belongs to that spine" and that claim cannot
  // be checked against a spine nobody can see.
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect
    .poll(
      async () =>
        page
          .locator(`[data-rail="${await bandOwner(page)}"]`)
          .evaluate((el) => {
            const r = el.getBoundingClientRect()
            return r.top < window.innerHeight && r.bottom > 0
          })
          .catch(() => true),
      { message: 'the owning rail must actually leave the viewport for this to test anything' },
    )
    .toBe(false)

  expect(await revealedId(page), 'band HOLDS the cover of the rail that left').toBe(held)
  await expect
    .poll(caretOpacity, { message: 'caret withdraws when its spine is off screen' })
    .toBe('0')
  expect(await bandOwner(page), 'ownership does not hand off').toBe(right.attr)
  void left
})
