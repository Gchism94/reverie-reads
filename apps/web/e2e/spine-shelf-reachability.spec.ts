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
// target, leaving that book with NO touch path at all. Width invariance and scroll coverage are
// both true throughout and both blind to this, which is why this suite exists BESIDE the
// invariant guard (spine-shelf-invariant.spec.ts — unmodified, sound, narrow), not inside it.
//
// What is asserted, per shelf size {1, 2, 3, 6, 36}:
//   · SCROLL REACH (scrolling shelves): sweeping scrollLeft 0→max makes EVERY book the pick at
//     some position, and the exact extremes pick the exact terminal books.
//   · TAP REACH (all shelves): every spine is genuinely hittable — real coordinate clicks, which
//     hit-test like a finger and FAIL on a buried target (dispatchEvent would pass through an
//     occluder and prove nothing) — and the reveal it produces can then be opened.
//   · SPREAD GEOMETRY (fits-without-scroll shelves): slot pitch ≥ REVEAL_W, so no reveal can
//     enter a sibling's slot.
//
// Environment honesty: this proves reachability under synthetic input — coordinates, hit-testing,
// and pick arithmetic. It does not prove the *feel* of the sliding anchor under a real finger,
// and it cannot test whether iOS fires pointerleave after tap-release (Chromium does not); both
// are device checks, named in the branch report.

const SUPABASE_URL = 'http://127.0.0.1:55321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const EMAIL = 'spine-reachability-e2e@reverie.local'
const PASSWORD = 'spine-reachability-e2e-password'
const REVEAL_W = 120 // duplicated from SpineShelf deliberately — a silent constant change should fail here

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
        bookIds.map((id, i) => ({ list_id: listId, book_id: id, owner_id: uid, position: i + 1 })),
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
  await page.route('**covers.reach.test**', (r) => r.fulfill({ body: png, contentType: 'image/png' }))
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
      const id = el.querySelector<HTMLElement>('[data-spine-reveal]')?.dataset.spineReveal
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
  for (const shelf of c.shelves.filter((s) => s.count <= 6)) {
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

test('spread geometry: fits-without-scroll shelves hold slot pitch >= REVEAL_W', async ({
  page,
}) => {
  const c = await setup()
  await signInOnce(page)
  for (const shelf of c.shelves.filter((s) => s.count >= 2 && s.count <= 3)) {
    await gotoShelf(page, shelf.listId, shelf.count)
    const pitches = await track(page).evaluate((el) => {
      const slots = [...el.querySelectorAll<HTMLElement>('[data-spine]')].map(
        (s) => s.parentElement!,
      )
      const lefts = slots.map((s) => s.offsetLeft)
      return lefts.slice(1).map((l, i) => l - lefts[i]!)
    })
    for (const p of pitches) {
      expect(p, `${shelf.name}: slot pitch ${p} must be >= ${REVEAL_W}`).toBeGreaterThanOrEqual(
        REVEAL_W,
      )
    }
    // and the reveal genuinely stays out of sibling slots: reveal book 1 via HOVER (reveals
    // without any chance of opening/navigating), assert its overlay's right edge is left of
    // book 2's slot
    const first = shelf.bookIds[0]!
    await page.locator(`[data-spine="${first}"]`).hover()
    await expect.poll(async () => revealedId(page)).toBe(first)
    const clear = await track(page).evaluate((el, second) => {
      const reveal = el.querySelector<HTMLElement>('[data-spine-reveal]')!
      const revealRight = parseFloat(reveal.style.left) + reveal.getBoundingClientRect().width
      const sibling = el.querySelector<HTMLElement>(`[data-spine="${second}"]`)!.parentElement!
      return { revealRight: Math.round(revealRight), siblingSlotLeft: sibling.offsetLeft }
    }, shelf.bookIds[1]!)
    expect(
      clear.revealRight,
      `reveal must not enter the sibling slot (${JSON.stringify(clear)})`,
    ).toBeLessThanOrEqual(clear.siblingSlotLeft)
  }

  // Boundary condition — the handoff between the two mechanisms must be coherent at the first
  // size where spreading meets scrolling. The 6-book shelf's natural content fits both project
  // viewports, so it SPREADS everywhere; whether the SPREAD content then overflows is
  // viewport-dependent (it does at 390 — 6×120 > 358 — and does not at 1280). Assert whichever
  // regime holds: a scrolling spread shelf must have the sliding anchor picking both terminals at
  // the exact extremes; a non-scrolling spread shelf must hold the pitch (its tap path is what
  // the tap-reach test already proved for all six books).
  const six = c.shelves.find((s) => s.count === 6)!
  await gotoShelf(page, six.listId, 6)
  const g = await track(page).evaluate((el) => ({
    scrollRange: el.scrollWidth - el.clientWidth,
  }))
  if (g.scrollRange > 0) {
    await track(page).evaluate((el) => (el.scrollLeft = 0))
    await expect.poll(async () => revealedId(page)).toBe(six.bookIds[0])
    await track(page).evaluate((el) => (el.scrollLeft = el.scrollWidth))
    await expect.poll(async () => revealedId(page)).toBe(six.bookIds[5])
  } else {
    const pitches = await track(page).evaluate((el) => {
      const lefts = [...el.querySelectorAll<HTMLElement>('[data-spine]')].map(
        (s) => s.parentElement!.offsetLeft,
      )
      return lefts.slice(1).map((l, i) => l - lefts[i]!)
    })
    for (const p of pitches) expect(p, 'non-scrolling spread 6-shelf pitch').toBeGreaterThanOrEqual(REVEAL_W)
  }
})
