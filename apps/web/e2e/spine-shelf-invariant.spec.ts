import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { authFailure } from './support/authError'
import { keepOfflineCacheEmpty } from './support/offlineCache'
import { ok, okUser } from './support/ok'

// THE INVARIANT: the spine shelf's track width does not change when the pick changes.
//
// docs/audits/mobile-shelf-interaction.md measured the defect this guards against: the reveal used
// to swap the picked ~26-48px spine for a 120px cover IN FLOW, mutating the scrollable track by
// 70-80px mid-gesture, so a momentum fling computed its destination against a track whose end then
// moved — the last 2-3 books at BOTH ends were unreachable on a real device. The fix takes the
// reveal out of layout flow (an overlay anchored over the picked slot); this suite asserts the
// resulting invariant directly, by measuring scrollWidth across many pick transitions.
//
// What this CANNOT prove, stated plainly (audit §5, and chore/e2e-mobile-viewport's null result):
// headless Chromium has no momentum physics and its synthetic input does not diverge under
// isMobile/hasTouch, and the audit proved a scrollLeft assignment reaches both ends even against
// the BROKEN build — so no scroll-and-look test here can certify that a real fling lands. What IS
// assertable in this environment is the layout property the gesture failure was made of: if track
// width never changes when the pick changes, the mid-gesture goalpost move cannot happen. Width is
// the mechanism; the fling itself is verified by hand on a device (see the PR).
//
// Pick transitions are driven both ways the component supports: scroll (the centre-most re-pick)
// and click (tap-to-reveal) — each asserted to have actually happened (the reveal overlay moves to
// the new book) before width is re-measured, so a build where picking broke entirely cannot pass
// vacuously.

const SUPABASE_URL = 'http://127.0.0.1:55321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const EMAIL = 'spine-shelf-invariant-e2e@reverie.local'
const PASSWORD = 'spine-shelf-invariant-e2e-password'
const SHELF = 'Invariant Shelf'

// 36 books so the track overflows BOTH project viewports (desktop 1280 and mobile 390): with no
// overflow, scrollWidth clamps to clientWidth and the invariant would hold vacuously even against
// the broken build. Spine widths are a per-id hash (26-48px), so ~36 spines ≈ 1.3-1.7k px of track.
// Six books are deliberately coverless: pre-fix, a coverless pick widened the SPINE itself to 120px
// in flow (`active` in Spine.tsx) — the same mutation by a different door, and the guard must hold
// across that path too.
const COUNT = 36
const COVERLESS = new Set([2, 9, 17, 25, 30, 35])

test.describe.configure({ mode: 'serial' })

type Client = {
  sb: ReturnType<typeof createClient>
  session: { access_token: string; refresh_token: string }
  uid: string
}
let shared: Client | null = null

async function client(): Promise<Client> {
  if (shared) return shared
  const admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data } = await admin.auth.admin.listUsers()
  let uid = data?.users?.find((u) => u.email === EMAIL)?.id
  if (!uid) {
    uid = (
      await okUser(
        admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true }),
        'spine-invariant createUser',
      )
    ).id
  }
  await ok(
    admin
      .from('profiles')
      .upsert({ id: uid, display_name: 'Spine Invariant E2E', skin: 'tryst', mode: 'dark' }),
    'spine-invariant profiles upsert',
  )
  const sb = createClient(SUPABASE_URL, ANON)
  const { data: s, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error || !s.session) throw new Error(authFailure('spine-invariant', EMAIL, error))
  shared = { sb, session: s.session, uid: s.session.user.id }
  return shared
}

/** One shelf of 36 books, most with covers. Returns the list id. */
async function seedShelf(c: Client): Promise<string> {
  const { data: existing } = await c.sb.from('books').select('id').eq('owner_id', c.uid)
  const ids = ((existing as { id: string }[]) ?? []).map((b) => b.id)
  if (ids.length) {
    await ok(c.sb.from('list_items').delete().in('book_id', ids), 'spine-invariant items delete')
    await ok(c.sb.from('books').delete().in('id', ids), 'spine-invariant books delete')
  }
  await ok(c.sb.from('lists').delete().eq('owner_id', c.uid), 'spine-invariant lists delete')

  // Every row carries EVERY column the batch uses, cover_url included as an explicit null where
  // absent — PostgREST builds one INSERT from the union of all rows' keys, and an omitted key
  // becomes an explicit NULL that a NOT NULL column rejects for the whole batch.
  const rows = Array.from({ length: COUNT }, (_, i) => ({
    owner_id: c.uid,
    title: `Invariant Probe ${String(i + 1).padStart(2, '0')}`,
    author_first: 'Nell',
    author_last: 'Marrow',
    genre: 'fantasy',
    status: 'standalone',
    ownership: 'owned',
    borrowed: false,
    wishlist: false,
    read_status: 'Read',
    cover_url: COVERLESS.has(i) ? null : `https://covers.invariant.test/${i + 1}.jpg`,
  }))
  const { error: insertError } = await c.sb.from('books').insert(rows)
  if (insertError) throw new Error(`spine-invariant seed failed: ${JSON.stringify(insertError)}`)

  const { data: list, error: listError } = await c.sb
    .from('lists')
    .insert({ owner_id: c.uid, name: SHELF, kind: 'collection', sort_order: 1 })
    .select('id')
    .single()
  if (listError || !list) {
    throw new Error(`spine-invariant list failed: ${JSON.stringify(listError)}`)
  }
  const listId = (list as { id: string }).id
  const { data: books } = await c.sb
    .from('books')
    .select('id, title')
    .eq('owner_id', c.uid)
    .order('title')
  await ok(
    c.sb.from('list_items').insert(
      ((books as { id: string }[]) ?? []).map((b, i) => ({
        list_id: listId,
        book_id: b.id,
        owner_id: c.uid,
        position: i + 1,
      })),
    ),
    'spine-invariant list_items insert',
  )
  return listId
}

async function signIn(page: Page, session: { access_token: string; refresh_token: string }) {
  await keepOfflineCacheEmpty(page)
  await page.addInitScript(() => localStorage.setItem('reverie.onboarded', '1'))
  await page.goto(
    `/#access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`,
  )
  await page.getByRole('button', { name: /enter your library/i }).click({ timeout: 20_000 })
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 20_000 })
}

async function stub(page: Page) {
  for (const p of ['search', 'enrich', 'embed', 'releases', 'series', 'covers'])
    await page.route(`**/functions/v1/${p}**`, (r) => r.fulfill({ json: {} }))
  await page.route('**/books/v1/volumes**', (r) => r.fulfill({ json: { items: [] } }))
  // A 1x1 PNG for every fixture cover — the overlay's geometry is fixed (120x176) regardless of
  // image content, and nothing here should touch the network.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  )
  await page.route('**covers.invariant.test**', (r) =>
    r.fulfill({ body: png, contentType: 'image/png' }),
  )
}

/** The shelf's scroll container — the overflow-x element wrapping the spines. */
const track = (page: Page) =>
  page
    .locator('[data-spine]')
    .first()
    .locator('xpath=ancestor::div[contains(@class,"overflow-x-auto")]')

const trackWidth = (page: Page) => track(page).evaluate((el) => el.scrollWidth)
const revealedId = (page: Page) =>
  page.locator('[data-spine-reveal]').getAttribute('data-spine-reveal')

/** REVEAL_W from SpineShelf.tsx — the overlay's fixed rendered width, duplicated here rather than
 *  imported so this assertion doesn't silently stop checking anything if the component's constant
 *  is ever renamed or inlined; a mismatch shows up as a failing width check instead. */
const REVEAL_W = 120

/** Direct geometry check for the clamp itself (audit point 5's edge rule), not just its side
 *  effect on scrollWidth: the reveal is positioned via inline `style.left` in the track's own
 *  content coordinates, so it must always land inside [0, scrollWidth - REVEAL_W]. This is what
 *  actually kills an unclamped-overlay mutant — this fixture's shelf always trails a "+" add-book
 *  slot (every real /shelf/:id mount passes onAdd), which happens to leave enough buffer that an
 *  unclamped overlay near the LAST book doesn't always grow scrollWidth measurably; the clamp's
 *  own geometry does not have that blind spot. */
async function assertOverlayClamped(page: Page, label: string) {
  const reveal = page.locator('[data-spine-reveal]')
  const left = await reveal.evaluate((el) => parseFloat((el as HTMLElement).style.left))
  const width = await trackWidth(page)
  expect(left, `${label}: overlay left >= 0`).toBeGreaterThanOrEqual(0)
  expect(left, `${label}: overlay right edge <= track width`).toBeLessThanOrEqual(width - REVEAL_W)
}

test('track width is invariant across pick transitions — scroll-driven, tap-driven, both ends, coverless', async ({
  page,
}) => {
  const c = await client()
  const listId = await seedShelf(c)
  await stub(page)
  await signIn(page, c.session)
  await page.goto(`/shelf/${listId}`)

  // The shelf is up once the last probe's spine exists; the initial pick has then revealed too
  // (activeId defaults to the centre-most on mount), so the baseline includes a live reveal.
  await expect(page.locator(`[data-spine]`)).toHaveCount(COUNT, { timeout: 20_000 })
  await expect(page.locator('[data-spine-reveal]')).toHaveCount(1)
  const baseline = await trackWidth(page)
  await assertOverlayClamped(page, 'baseline')

  // The track must actually overflow this viewport, or every assertion below is vacuous
  // (scrollWidth clamps to clientWidth when nothing overflows). Guard the guard.
  const clientW = await track(page).evaluate((el) => el.clientWidth)
  expect(baseline).toBeGreaterThan(clientW + 200)

  // ── Scroll-driven picks: walk the track start → middle → end. Each step must MOVE the pick
  // (the overlay re-anchors to a different book) and must not move the track's width.
  let prev = await revealedId(page)
  for (const fraction of [0.5, 1]) {
    await track(page).evaluate((el, f) => {
      el.scrollLeft = Math.round((el.scrollWidth - el.clientWidth) * f)
    }, fraction)
    await expect
      .poll(async () => revealedId(page), { message: `scroll to ${fraction} should re-pick` })
      .not.toBe(prev)
    prev = await revealedId(page)
    expect(await trackWidth(page), `width after scroll to ${fraction}`).toBe(baseline)
    await assertOverlayClamped(page, `scroll to ${fraction}`)
  }

  // ── Tap-driven picks, one of them coverless. Pre-fix these are (among) where the mutation
  // regenerated ("the last 2-3 at BOTH ends"); post-fix they are also where an unclamped overlay
  // would GROW scrollWidth (an abspos overhang past the content edge extends the scrollable
  // overflow region) — both failures land in the same assertion. Deliberately NOT
  // `scrollIntoViewIfNeeded` + click: that auto-scroll centres the target, which the scroll-driven
  // pick would then reveal on its own — leaving the click to OPEN rather than REVEAL and proving
  // nothing about the tap path. Instead each target is placed near the track's LEFT edge (visible,
  // off-centre), confirmed NOT already the pick, then tapped — a genuine reveal transition.
  //
  // Ordered so EACH target is many slots from whatever is currently revealed (only one spine is
  // ever shown at a time, so only consecutive adjacency matters): the scroll walk above ends near
  // book 36, so the first tap target is book 03 — far enough that its own 120px-wide reveal
  // overlay (occlusion is real, by design — audit point 3, reachable only by scroll) can't still
  // be covering it. 03 → 20 → 36 are each ~17 slots apart the same way.
  //
  // `dispatchEvent('click')`, not `.click()`: a PRE-EXISTING, out-of-scope defect (reported
  // separately, reproduces identically on main before this branch) makes `/shelf/:id` at 36 books
  // widen the page's LAYOUT viewport past its VISUAL one at this project's touch viewport — proven
  // by direct measurement here to be a real coordinate-space mismatch, not an overlap in this
  // component: `elementFromPoint` at the target's exact centre resolves to the target's own
  // descendant every time (confirmed via `closest('[data-spine]')`), yet Playwright's real
  // mouse-coordinate `.click()` reports a DIFFERENT intercepting element on every retry against the
  // same point — the signature of a scale mismatch sampling near-but-wrong pixels, not a stable
  // z-index conflict. `dispatchEvent` fires the same DOM click the button's own `onClick` handles,
  // without depending on that broken coordinate mapping.
  // Probe 01 (the true first book, left content edge) is included specifically to exercise the
  // LEFT clamp — Probe 03's unclamped position was already inside bounds in this fixture (the
  // trailing "+" add-book slot leaves just enough buffer at the RIGHT edge that Probe 36 alone
  // doesn't always expose an unclamped right edge either; Probe 01's centred position is
  // arithmetically negative regardless of trailing content, so it always needs the left clamp).
  for (const title of [
    'Invariant Probe 03',
    'Invariant Probe 20',
    'Invariant Probe 36',
    'Invariant Probe 01',
  ]) {
    const spine = page.locator(`[data-spine][title="${title}"]`)
    const id = await spine.getAttribute('data-spine')
    await track(page).evaluate((el, spineId) => {
      const slot = el.querySelector<HTMLElement>(`[data-spine="${spineId}"]`)
      if (!slot) throw new Error(`spine ${spineId} not in the track`)
      el.scrollLeft = Math.max(0, slot.offsetLeft - 24)
    }, id)
    await expect
      .poll(async () => revealedId(page), { message: `${title} settling off-centre` })
      .not.toBe(id)
    await spine.dispatchEvent('click') // not yet shown → reveals (does not open)
    await expect
      .poll(async () => revealedId(page), { message: `${title} should now be revealed` })
      .toBe(id)
    await expect(page.locator(`[data-spine-reveal="${id}"]`)).toBeVisible()
    expect(await trackWidth(page), `width with ${title} revealed`).toBe(baseline)
    await assertOverlayClamped(page, title)

    // ── Audit point 5, checked directly (not just via the width side effect): the overlay must
    // anchor to the PICKED SLOT, not the scroll container's centre. Book 20 is unclamped (a
    // middle pick) and was tap-revealed while off-centre, so its slot's own midpoint and the
    // container's current visual centre are two genuinely different numbers — a container-centre
    // anchor would land near the LATTER, not the former, and this catches that directly.
    if (title === 'Invariant Probe 20') {
      const geometry = await track(page).evaluate((el, spineId) => {
        const slot = el.querySelector<HTMLElement>(`[data-spine="${spineId}"]`)!
        const reveal = el.querySelector<HTMLElement>('[data-spine-reveal]')!
        return {
          slotCentre: slot.offsetLeft + slot.offsetWidth / 2,
          containerCentre: el.scrollLeft + el.clientWidth / 2,
          revealLeft: parseFloat(reveal.style.left),
        }
      }, id)
      const revealCentre = geometry.revealLeft + REVEAL_W / 2
      // The two candidate anchors must actually differ, or this run proves nothing.
      expect(
        Math.abs(geometry.slotCentre - geometry.containerCentre),
        'slot and container centre must differ for this check to mean anything',
      ).toBeGreaterThan(REVEAL_W)
      // Tolerance 2px: the component rounds `left` to a whole pixel, and DPR-3 subpixel layout
      // measurements routinely land on a .5 — a stricter check would fail on that rounding, not on
      // a real defect.
      expect(
        Math.abs(revealCentre - geometry.slotCentre),
        'overlay anchors to the SLOT centre',
      ).toBeLessThanOrEqual(2)
      expect(
        Math.abs(revealCentre - geometry.containerCentre),
        'overlay must NOT anchor to the container centre',
      ).toBeGreaterThan(REVEAL_W / 2)
    }
  }

  // ── The revealed cover is the tap target (audit requirement: once revealed, the cover, not the
  // spine beneath). Clicking the overlay itself — including where it overhangs neighbours — opens
  // the revealed book, not a neighbour.
  const targetId = await revealedId(page)
  await page.locator('[data-spine-reveal]').dispatchEvent('click') // see the coordinate-mismatch note above
  await expect(page).toHaveURL(new RegExp(`/book/${targetId}`))
})
