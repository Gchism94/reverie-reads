import { expect, test, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { authFailure } from './support/authError'
import { ok, okUser } from './support/ok'

// Regression guards for docs/task-series-defects.md as REVISED by the #64/#65 audit. The original
// work was verified at the DB level only, and three of its four claims did not survive an eyeball:
//   · removal from the series page was unreachable for any book in the library (the ✕ was gated on
//     `!book`), so a book added from "see the whole series" could never be taken out again;
//   · removal from the book page kept the slot as a ghost, which reads as "it didn't stick";
//   · positions were seeded verbatim from books.position, so an import's global-order numbers
//     rendered as "#87, #412, #1290".
// Everything below drives the real UI — the controls a reader actually touches.

const SUPABASE_URL = 'http://127.0.0.1:55321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const TEST_EMAIL = 'series-defects-e2e@reverie.local'
const TEST_PASSWORD = 'series-defects-e2e-password'

test.describe.configure({ mode: 'serial' })

async function ensureUser(): Promise<void> {
  const admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data } = await admin.auth.admin.listUsers()
  let uid = data?.users?.find((u) => u.email === TEST_EMAIL)?.id
  if (!uid) {
    uid = (
      await okUser(
        admin.auth.admin.createUser({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          email_confirm: true,
        }),
        'series-removal-positions createUser',
      )
    ).id
  }
  await ok(
    admin
      .from('profiles')
      .upsert({ id: uid, display_name: 'Series Defects E2E', skin: 'tryst', mode: 'system' }),
    'series-removal-positions profiles upsert',
  )
}

type Client = {
  sb: SupabaseClient
  session: { access_token: string; refresh_token: string }
  uid: string
}
let shared: Client | null = null
async function client(): Promise<Client> {
  if (shared) return shared
  await ensureUser()
  const sb = createClient(SUPABASE_URL, ANON)
  const { data, error } = await sb.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  })
  if (error || !data.session)
    throw new Error(authFailure('series-removal-positions', TEST_EMAIL, error))
  shared = { sb, session: data.session, uid: data.session.user.id }
  return shared
}

async function reset(c: Client) {
  const { data: books } = await c.sb.from('books').select('id').eq('owner_id', c.uid)
  const ids = ((books as { id: string }[]) ?? []).map((b) => b.id)
  if (ids.length) {
    await ok(
      c.sb.from('list_items').delete().in('book_id', ids),
      'series-removal-positions list_items delete',
    )
    await ok(c.sb.from('books').delete().in('id', ids), 'series-removal-positions books delete')
  }
  const { data: ser } = await c.sb.from('series').select('id').eq('owner_id', c.uid)
  const sids = ((ser as { id: string }[]) ?? []).map((s) => s.id)
  if (sids.length) await c.sb.from('series_entries').delete().in('series_id', sids)
  await ok(
    c.sb.from('series').delete().eq('owner_id', c.uid),
    'series-removal-positions series delete',
  )
  await ok(
    c.sb.from('lists').delete().eq('owner_id', c.uid),
    'series-removal-positions lists delete',
  )
}

async function signIn(page: Page, session: { access_token: string; refresh_token: string }) {
  await page.addInitScript(() => localStorage.setItem('reverie.onboarded', '1'))
  await page.goto(
    `/#access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`,
  )
  await page.getByRole('button', { name: /enter your library/i }).click({ timeout: 20_000 })
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => indexedDB.deleteDatabase('reverie-offline'))
}

/** The catalog stub doubles as the resurrection test: it always reports all three canonical slots. */
const SOURCE_ENTRIES = [
  { position: 1, title: 'Audit Alpha', author: 'Nell Marrow' },
  { position: 2, title: 'Audit Bravo', author: 'Nell Marrow' },
  { position: 3, title: 'Audit Charlie', author: 'Nell Marrow' },
]

async function stubBackends(page: Page) {
  await page.route('**/functions/v1/search**', (r) => r.fulfill({ json: { results: [] } }))
  await page.route('**/functions/v1/enrich**', (r) => r.fulfill({ json: { rateLimited: false } }))
  await page.route('**/functions/v1/covers**', (r) =>
    r.fulfill({ status: 422, json: { error: 'fetch_failed' } }),
  )
  await page.route('**/functions/v1/embed**', (r) =>
    r.fulfill({ json: { hasTaste: false, scores: [] } }),
  )
  await page.route('**/functions/v1/releases**', (r) => r.fulfill({ json: { hits: [] } }))
  await page.route('**/functions/v1/series**', (r) =>
    r.fulfill({ json: { sourceRef: 'stub', entries: SOURCE_ENTRIES } }),
  )
  await page.route('**/books/v1/volumes**', (r) => r.fulfill({ json: { items: [] } }))
}

const SERIES = 'Audit Cycle'

/** Three books in one series. `positions` lets a test seed import-shaped values. */
async function seedSeries(c: Client, positions: (number | null)[] = [1, 2, 3]) {
  const titles = ['Audit Alpha', 'Audit Bravo', 'Audit Charlie']
  const ids: string[] = []
  for (let i = 0; i < titles.length; i++) {
    const { data, error } = await c.sb
      .from('books')
      .insert({
        owner_id: c.uid,
        title: titles[i],
        author_first: 'Nell',
        author_last: 'Marrow',
        series: SERIES,
        position: positions[i],
        status: 'ongoing',
        genre: 'fantasy',
        ownership: 'owned',
        cover_url: '/landing-covers/everflame.jpg',
      })
      .select('id')
      .single()
    if (error) throw error
    ids.push((data as { id: string }).id)
  }
  return ids
}

const liveEntries = async (c: Client) => {
  const { data: s } = await c.sb
    .from('series')
    .select('id')
    .eq('owner_id', c.uid)
    .eq('name', SERIES)
    .maybeSingle()
  if (!s) return []
  const { data } = await c.sb
    .from('series_entries')
    .select('title, position, book_id, removed_at')
    .eq('series_id', (s as { id: string }).id)
    .is('removed_at', null)
    .order('position')
  return (data ?? []) as { title: string; position: number; book_id: string | null }[]
}

const bookRow = async (c: Client, title: string) =>
  (
    await c.sb
      .from('books')
      .select('id, series, position')
      .eq('owner_id', c.uid)
      .eq('title', title)
      .maybeSingle()
  ).data as { id: string; series: string | null; position: number | null } | null

/** One entry row by title, tombstoned or not — the id is what direct-state fixtures need. */
const entryByTitle = async (c: Client, title: string) => {
  const { data: s } = await c.sb
    .from('series')
    .select('id')
    .eq('owner_id', c.uid)
    .eq('name', SERIES)
    .maybeSingle()
  if (!s) return null
  const { data } = await c.sb
    .from('series_entries')
    .select('id, title, book_id, removed_at')
    .eq('series_id', (s as { id: string }).id)
    .eq('title', title)
    .maybeSingle()
  return data as {
    id: string
    title: string
    book_id: string | null
    removed_at: string | null
  } | null
}

/**
 * The mutating REST calls a UI action makes, as `METHOD table` strings.
 *
 * The atomicity claim lives HERE rather than in a read of the resulting rows, because from outside
 * the database "both writes were one transaction" is only observable as "the client issued one call
 * that does both". Reading state afterwards cannot distinguish the two paths — under the old
 * two-write code both rows also end up correct, just not simultaneously, and the window is a single
 * local round trip, so a state-based check goes flaky instead of red. Request shape is deterministic:
 * the RPC path is one `POST rpc/remove_series_entry` and zero `PATCH books`, the two-write path is
 * the exact inverse.
 *
 * GETs are dropped so the invalidation refetches that follow every removal don't enter the count.
 */
async function recordWrites(page: Page, action: () => Promise<void>): Promise<string[]> {
  const seen: string[] = []
  const onRequest = (r: { method: () => string; url: () => string }) => {
    const method = r.method()
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return
    const { pathname } = new URL(r.url())
    if (!pathname.startsWith('/rest/v1/')) return
    seen.push(`${method} ${pathname.replace('/rest/v1/', '')}`)
  }
  page.on('request', onRequest)
  try {
    await action()
  } finally {
    page.off('request', onRequest)
  }
  return seen
}

const badges = (page: Page) =>
  page.locator('ol li span.text-\\[15px\\].font-bold').allTextContents()
const openSeries = async (page: Page) => {
  await page.goto(`/series/${encodeURIComponent(SERIES)}`)
  await expect(page.locator('ol li').first()).toBeVisible({ timeout: 20_000 })
}

// ── Defect 2: the remove control must exist for a book that IS in the library ──
test('series page: a linked book can be removed, and stays removed', async ({ page }) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  await seedSeries(c)
  await stubBackends(page)
  try {
    await signIn(page, c.session)
    await openSeries(page)
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(3)

    // Pre-fix this button did not render at all for a linked book — the ✕ was gated on `!book`.
    const row = page.locator('ol li').filter({ hasText: 'Audit Bravo' })
    await row.getByRole('button', { name: /Remove Audit Bravo from the series/i }).click()

    // Confirmed, not instant — removal discards the slot's place in the order.
    const confirm = page.getByRole('dialog', { name: /Remove from this series/i })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: /^Remove$/ }).click()

    await expect
      .poll(async () => (await liveEntries(c)).map((e) => e.title), { timeout: 15_000 })
      .toEqual(['Audit Alpha', 'Audit Charlie'])
    // The book keeps existing; it just stops naming the series. NOT polled, deliberately: both
    // writes land in one transaction now (remove_series_entry, 20260731010000), so by the moment the
    // tombstone above is visible the cleared series is visible too. This assertion used to be a poll,
    // under a comment explaining that useRemoveEntry wrote series_entries and books.series as two
    // separate sequential round trips and a reader querying independently could catch the first
    // commit before the second landed. That is no longer true, so the poll is gone with it.
    //
    // This is not the guard against regressing to two writes — it would only fail on the runs that
    // happened to sample inside a one-round-trip window, which is flaky rather than red. The
    // atomicity claim is carried by 'removal issues exactly one atomic RPC…' below, which is
    // deterministic. What this line proves is the ordering the old path violated: once the tombstone
    // is observable, the book has already stopped naming the series.
    expect((await bookRow(c, 'Audit Bravo'))?.series).toBeFalsy()

    // Survives a full reload — reconciliation must not re-add it.
    await page.reload()
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(2)
    expect(await page.locator('ol li').filter({ hasText: 'Audit Bravo' }).count()).toBe(0)
  } finally {
    await reset(c)
  }
})

// ── S3b: the atomicity claim, carried by request shape — see recordWrites for why not by state ──
test('removal issues exactly one atomic RPC and no separate books write', async ({ page }) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  await seedSeries(c)
  await stubBackends(page)
  try {
    await signIn(page, c.session)
    await openSeries(page)
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(3)

    // This is remove_series_entry's first call over PostgREST with a real JWT — where a signature
    // mismatch, a missing execute grant, or a PostgREST schema cache that never saw the new function
    // would surface. The mutation throws on error, so any of those also shows up as the state
    // assertions at the bottom failing to land.
    const writes = await recordWrites(page, async () => {
      await page
        .locator('ol li')
        .filter({ hasText: 'Audit Bravo' })
        .getByRole('button', { name: /Remove Audit Bravo from the series/i })
        .click()
      await page
        .getByRole('dialog', { name: /Remove from this series/i })
        .getByRole('button', { name: /^Remove$/ })
        .click()
      await expect
        .poll(async () => (await liveEntries(c)).some((e) => e.title === 'Audit Bravo'), {
          timeout: 15_000,
        })
        .toBe(false)
    })

    expect(writes.filter((w) => w === 'POST rpc/remove_series_entry')).toHaveLength(1)
    // The two-write path's fingerprint was a PATCH against books to null the series, plus a PATCH
    // against series_entries for the tombstone. Both belong to the server now.
    expect(writes.filter((w) => w.startsWith('PATCH books'))).toEqual([])
    expect(writes.filter((w) => w.startsWith('PATCH series_entries'))).toEqual([])

    // ...and both halves did land.
    expect((await bookRow(c, 'Audit Bravo'))?.series).toBeFalsy()
    const tomb = await entryByTitle(c, 'Audit Bravo')
    expect(tomb?.removed_at).toBeTruthy()
    expect(tomb?.book_id).toBeNull()
  } finally {
    await reset(c)
  }
})

// ── S3b: the state the old path could leave, what it did next, and that the RPC can't produce it ──
test('a half-committed removal revives on the next read; the RPC path never creates one', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  await seedSeries(c)
  await stubBackends(page)
  try {
    await signIn(page, c.session)
    await openSeries(page) // materialize the entries
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(3)

    // ── Part 1: the old defect, reconstructed by hand. Tombstone the entry and leave books.series
    //    standing — exactly what a failure between the old path's two writes left behind. Written
    //    directly against the stack because the app can no longer produce it, which is the point.
    const bravo = await entryByTitle(c, 'Audit Bravo')
    expect(bravo?.id).toBeTruthy()
    await ok(
      c.sb
        .from('series_entries')
        .update({ removed_at: new Date().toISOString(), book_id: null, user_edited: true })
        .eq('id', bravo!.id),
      'series-removal-positions series_entries update',
    )
    expect((await bookRow(c, 'Audit Bravo'))?.series).toBe(SERIES) // the uncommitted half, standing

    // Opening the series page runs reconciliation, which revives any tombstone whose title matches a
    // book still naming the series. The removal undoes ITSELF. This is the defect, demonstrated
    // rather than described — the reason S3a existed.
    await openSeries(page)
    await expect
      .poll(async () => (await liveEntries(c)).map((e) => e.title), { timeout: 20_000 })
      .toEqual(['Audit Alpha', 'Audit Bravo', 'Audit Charlie'])

    // ── Part 2: the same removal through the RPC leaves no such state, so it sticks.
    await page
      .locator('ol li')
      .filter({ hasText: 'Audit Bravo' })
      .getByRole('button', { name: /Remove Audit Bravo from the series/i })
      .click()
    await page
      .getByRole('dialog', { name: /Remove from this series/i })
      .getByRole('button', { name: /^Remove$/ })
      .click()
    await expect
      .poll(async () => (await liveEntries(c)).some((e) => e.title === 'Audit Bravo'), {
        timeout: 15_000,
      })
      .toBe(false)
    // The half that makes revive possible is cleared in the same transaction as the tombstone.
    expect((await bookRow(c, 'Audit Bravo'))?.series).toBeFalsy()

    // So reconciliation has nothing to revive from, across a full reload.
    await page.reload()
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(2)
    expect(await page.locator('ol li').filter({ hasText: 'Audit Bravo' }).count()).toBe(0)
    expect((await entryByTitle(c, 'Audit Bravo'))?.removed_at).toBeTruthy()
  } finally {
    await reset(c)
  }
})

// ── S3b: repeat removal, matching the pgTAP guard, over the real authenticated HTTP path ──
test('removing the same slot twice over HTTP is harmless', async ({ page }) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  await seedSeries(c)
  await stubBackends(page)
  try {
    await signIn(page, c.session)
    await openSeries(page)
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(3)

    await page
      .locator('ol li')
      .filter({ hasText: 'Audit Bravo' })
      .getByRole('button', { name: /Remove Audit Bravo from the series/i })
      .click()
    await page
      .getByRole('dialog', { name: /Remove from this series/i })
      .getByRole('button', { name: /^Remove$/ })
      .click()
    await expect
      .poll(async () => (await liveEntries(c)).some((e) => e.title === 'Audit Bravo'), {
        timeout: 15_000,
      })
      .toBe(false)
    const after = await entryByTitle(c, 'Audit Bravo')

    // The second call goes over the same authenticated HTTP path the app uses. A literal double-tap
    // through the UI is not reachable — the confirm modal closes on click and the button carries
    // removeEntry.isPending — so what is exercised here is the retry-after-a-failed-toast shape:
    // the same request, same JWT, same entry, a second time.
    const { error } = await c.sb.rpc('remove_series_entry', { p_entry: after!.id })
    expect(error).toBeNull()

    const twice = await entryByTitle(c, 'Audit Bravo')
    expect(twice?.removed_at).toBeTruthy()
    expect(twice?.book_id).toBeNull()
    expect((await bookRow(c, 'Audit Bravo'))?.series).toBeFalsy()
    // Two live slots and nothing added — the repeat neither errored nor changed anything.
    expect((await liveEntries(c)).map((e) => e.title)).toEqual(['Audit Alpha', 'Audit Charlie'])
  } finally {
    await reset(c)
  }
})

// ── Defect 2, the reported path: ghost → "＋ Add" → must still be removable ──
test('series page: a book acquired from a ghost slot can be removed again', async ({ page }) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  const ids = await seedSeries(c)
  await stubBackends(page)
  const prompts = ['Phantom Tome', 'Nell Marrow']
  page.on('dialog', (d) => void d.accept(prompts.shift() ?? ''))
  try {
    await signIn(page, c.session)
    // Reached the way the reader does: the book page's "see the whole series" door.
    await page.goto(`/book/${ids[0]}`)
    await expect(page.getByRole('heading', { name: 'Audit Alpha' })).toBeVisible({
      timeout: 20_000,
    })
    await page.getByLabel(`Open the ${SERIES} series page`).click()
    await expect(page).toHaveURL(/\/series\//, { timeout: 20_000 })

    await page.getByRole('button', { name: /One you don’t have yet/i }).click()
    const ghostRow = page.locator('ol li').filter({ hasText: 'Phantom Tome' })
    await expect(ghostRow).toBeVisible({ timeout: 20_000 })

    // Acquire it — this is what used to make the ✕ vanish for good.
    await ghostRow.getByRole('button', { name: /Add$/ }).first().click()
    const acquire = page.getByRole('dialog', { name: /Add Phantom Tome/i })
    await expect(acquire).toBeVisible({ timeout: 15_000 })
    await acquire.getByRole('button', { name: /Add to wishlist/i }).click()
    await expect
      .poll(
        async () => (await liveEntries(c)).find((e) => e.title === 'Phantom Tome')?.book_id ?? null,
        { timeout: 15_000 },
      )
      .not.toBeNull()

    // Still removable now that it's a real book.
    const linkedRow = page.locator('ol li').filter({ hasText: 'Phantom Tome' })
    await linkedRow.getByRole('button', { name: /Remove Phantom Tome from the series/i }).click()
    await page
      .getByRole('dialog', { name: /Remove from this series/i })
      .getByRole('button', { name: /^Remove$/ })
      .click()

    await expect
      .poll(async () => (await liveEntries(c)).some((e) => e.title === 'Phantom Tome'), {
        timeout: 15_000,
      })
      .toBe(false)
  } finally {
    await reset(c)
  }
})

// ── Defect 1: clearing the series field on the book page removes the slot outright ──
test('book page: clearing the series field removes the slot, not just the link', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  const ids = await seedSeries(c)
  await stubBackends(page)
  try {
    await signIn(page, c.session)
    await openSeries(page) // materialize the entries first
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(3)

    await page.goto(`/book/${ids[2]}`)
    await expect(page.getByRole('heading', { name: 'Audit Charlie' })).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('button', { name: /^Edit details$/i }).click()
    const dialog = page.getByRole('dialog', { name: /Edit details/i })
    await dialog
      .locator('label', { hasText: /^Series$/ })
      .locator('input')
      .fill('')

    // Naming the consequence before it happens.
    await dialog.getByRole('button', { name: /Save details/i }).click()
    await expect(dialog.getByText(/removes the book’s slot from Audit Cycle/i)).toBeVisible()
    await dialog.getByRole('button', { name: /Save and remove/i }).click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })

    await expect
      .poll(async () => (await liveEntries(c)).map((e) => e.title), { timeout: 15_000 })
      .toEqual(['Audit Alpha', 'Audit Bravo'])
    expect((await bookRow(c, 'Audit Charlie'))?.series).toBeFalsy()

    // The series page must not show it at all — not as a book, and not as a leftover ghost slot.
    await openSeries(page)
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(2)
    expect(await page.locator('ol li').filter({ hasText: 'Audit Charlie' }).count()).toBe(0)

    // And the book page stops advertising the series.
    await page.goto(`/book/${ids[2]}`)
    await expect(page.getByRole('heading', { name: 'Audit Charlie' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByLabel(`Open the ${SERIES} series page`)).toHaveCount(0)
  } finally {
    await reset(c)
  }
})

// ── Defect 1's tombstone: a canonical refresh must respect the reader's removal ──
test('a source refresh does not resurrect a removed slot', async ({ page }) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  await seedSeries(c)
  await stubBackends(page)
  try {
    await signIn(page, c.session)
    await openSeries(page)
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(3)

    await page
      .locator('ol li')
      .filter({ hasText: 'Audit Bravo' })
      .getByRole('button', { name: /Remove Audit Bravo/i })
      .click()
    await page
      .getByRole('dialog', { name: /Remove from this series/i })
      .getByRole('button', { name: /^Remove$/ })
      .click()
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 15_000 }).toBe(2)

    // The stubbed catalog still reports Audit Bravo as canonical slot #2.
    await page.getByRole('button', { name: /Fetch series data/i }).click()
    await expect(page.getByText(/Already up to date|canonical/i)).toBeVisible({ timeout: 20_000 })

    await page.reload()
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(2)
    expect(await page.locator('ol li').filter({ hasText: 'Audit Bravo' }).count()).toBe(0)
  } finally {
    await reset(c)
  }
})

// ── Defect 3c: import global-order numbers must not become the reading order ──
test('import global-order positions seed as a sane 1..n', async ({ page }) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  // The audit's reproduction: Hardcover-style global order on books.position.
  await seedSeries(c, [412, 87, 1290])
  await stubBackends(page)
  try {
    await signIn(page, c.session)
    await openSeries(page)
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(3)
    // Pre-fix this rendered ["#87","#412","#1290"]; relative order is kept, the numbers are sane.
    await expect.poll(() => badges(page), { timeout: 15_000 }).toEqual(['#1', '#2', '#3'])
    expect((await liveEntries(c)).map((e) => e.title)).toEqual([
      'Audit Bravo',
      'Audit Alpha',
      'Audit Charlie',
    ])
  } finally {
    await reset(c)
  }
})

// ── Defect 3c: a null-position library orders deterministically, not by row order ──
test('null positions seed deterministically by title', async ({ page }) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  await seedSeries(c, [null, null, null])
  await stubBackends(page)
  try {
    await signIn(page, c.session)
    await openSeries(page)
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(3)
    await expect.poll(() => badges(page), { timeout: 15_000 }).toEqual(['#1', '#2', '#3'])
    expect((await liveEntries(c)).map((e) => e.title)).toEqual([
      'Audit Alpha',
      'Audit Bravo',
      'Audit Charlie',
    ])
  } finally {
    await reset(c)
  }
})

// ── Defect 3b + 3d: the book page's position edit lands, and lands WITHOUT a stale repaint ──
test('book-page position edits take effect immediately on the series page', async ({ page }) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  const ids = await seedSeries(c)
  await stubBackends(page)
  try {
    await signIn(page, c.session)
    await openSeries(page)
    await expect.poll(() => badges(page), { timeout: 20_000 }).toEqual(['#1', '#2', '#3'])

    const setPosition = async (bookId: string, heading: string, value: string) => {
      await page.goto(`/book/${bookId}`)
      await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 20_000 })
      await page.getByRole('button', { name: /^Edit details$/i }).click()
      const dlg = page.getByRole('dialog', { name: /Edit details/i })
      await dlg
        .locator('label', { hasText: /^Position$/ })
        .locator('input')
        .fill(value)
      await dlg.getByRole('button', { name: /Save details/i }).click()
      await expect(dlg).toBeHidden({ timeout: 15_000 })
    }

    await setPosition(ids[1]!, 'Audit Bravo', '9')
    await expect
      .poll(async () => (await bookRow(c, 'Audit Bravo'))?.position, { timeout: 15_000 })
      .toBe(9)
    // Wait for the SERIES side too before leaving the page. useSyncBookSeries is chained after
    // updateBook, so the book row lands first; navigating between the two would tear down the page
    // mid-mutation and the guard below would be measuring a lost write, not a stale repaint.
    await expect
      .poll(async () => (await liveEntries(c)).find((e) => e.title === 'Audit Bravo')?.position, {
        timeout: 15_000,
      })
      .toBe(9)

    // The stale-paint guard: sample repeatedly from the moment the page opens. The pre-fix build
    // restored the persisted cache and painted ["#1","#2","#3"] for ~2s before the refetch landed.
    await openSeries(page)
    const samples: string[][] = []
    for (let i = 0; i < 12; i++) {
      samples.push(await badges(page))
      await page.waitForTimeout(150)
    }
    const stale = samples.filter((s) => s.join(',') === '#1,#2,#3')
    expect(stale, `series page repainted pre-edit badges: ${JSON.stringify(samples)}`).toEqual([])
    await expect.poll(() => badges(page), { timeout: 15_000 }).toEqual(['#1', '#3', '#9'])

    // 3d: 0 is a real position (the prequel slot) — `Number(v) || ''` used to swallow it.
    await setPosition(ids[0]!, 'Audit Alpha', '0')
    await expect
      .poll(async () => (await bookRow(c, 'Audit Alpha'))?.position, { timeout: 15_000 })
      .toBe(0)
    await expect
      .poll(async () => (await liveEntries(c)).find((e) => e.title === 'Audit Alpha')?.position, {
        timeout: 15_000,
      })
      .toBe(0)

    // 3d: clearing the field must not leave the old number standing on the series side.
    await setPosition(ids[1]!, 'Audit Bravo', '')
    await expect
      .poll(async () => (await bookRow(c, 'Audit Bravo'))?.position, { timeout: 15_000 })
      .toBeNull()
    await expect
      .poll(async () => (await liveEntries(c)).find((e) => e.title === 'Audit Bravo')?.position, {
        timeout: 15_000,
      })
      .not.toBe(9)
  } finally {
    await reset(c)
  }
})
