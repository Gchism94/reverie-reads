import { expect, test, type Page } from './support/fixtures'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { authFailure } from './support/authError'
import { keepOfflineCacheEmpty } from './support/offlineCache'
import { ok, okData, okUser } from './support/ok'

// Regression guards for docs/archive/task-series-defects.md as REVISED by the #64/#65 audit. The original
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
  await keepOfflineCacheEmpty(page)
  await page.addInitScript(() => localStorage.setItem('reverie.onboarded', '1'))
  await page.goto(
    `/#access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`,
  )
  await page.getByRole('button', { name: /enter your library/i }).click({ timeout: 20_000 })
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 20_000 })
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

/** This series' row id — every direct-state fixture below needs it. */
const seriesId = async (c: Client): Promise<string> => {
  const s = await okData(
    c.sb.from('series').select('id').eq('owner_id', c.uid).eq('name', SERIES).single(),
    'series-removal-positions series id',
  )
  return (s as { id: string }).id
}

/** Plant a TOMBSTONE directly. Two of these sharing a title is the state the revive matcher exists
 *  to disambiguate, and it cannot be produced through the UI — a reissue or an unmerged duplicate
 *  gets you there in a real library, but not in a fixture. */
async function insertTombstone(
  c: Client,
  { title, author, position }: { title: string; author: string; position: number },
): Promise<string> {
  const row = await okData(
    c.sb
      .from('series_entries')
      .insert({
        series_id: await seriesId(c),
        owner_id: c.uid,
        position,
        title,
        author,
        book_id: null,
        user_edited: true,
        removed_at: new Date().toISOString(),
      })
      .select('id')
      .single(),
    'series-removal-positions tombstone insert',
  )
  return (row as { id: string }).id
}

/** Plant a LIVE ghost slot directly — a canonical entry with no book yet. Two sharing a title is
 *  the adoption ambiguity that `matchEntryForBook` refuses, and it is not producible through the UI
 *  in one series without hand-editing. */
async function insertGhost(
  c: Client,
  { title, author, position }: { title: string; author: string; position: number },
): Promise<string> {
  const row = await okData(
    c.sb
      .from('series_entries')
      .insert({
        series_id: await seriesId(c),
        owner_id: c.uid,
        position,
        title,
        author,
        book_id: null,
        user_edited: true,
        removed_at: null,
      })
      .select('id')
      .single(),
    'series-removal-positions ghost insert',
  )
  return (row as { id: string }).id
}

/** Every entry with this title, tombstoned or not — the assertions need to see both sides. */
const entriesByTitle = async (c: Client, title: string) => {
  const { data } = await c.sb
    .from('series_entries')
    .select('id, title, author, book_id, removed_at')
    .eq('series_id', await seriesId(c))
    .eq('title', title)
    .order('position', { ascending: true })
  return (data ?? []) as {
    id: string
    title: string
    author: string
    book_id: string | null
    removed_at: string | null
  }[]
}

/** One extra library book in this series, so reconciliation has something to revive FROM. */
async function seedExtraBook(c: Client, title: string, first: string, last: string) {
  const row = await okData(
    c.sb
      .from('books')
      .insert({
        owner_id: c.uid,
        title,
        author_first: first,
        author_last: last,
        series: SERIES,
        position: 9,
        status: 'ongoing',
        genre: 'fantasy',
        ownership: 'owned',
        cover_url: '/landing-covers/everflame.jpg',
      })
      .select('id')
      .single(),
    'series-removal-positions extra book insert',
  )
  return (row as { id: string }).id
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
    //
    // ── CONTRACT CHANGE, feat/series-integrity-mechanism Phase 2 ────────────────────────────────
    // This block used to assert `books.position` came back NULL while the entry moved to the end
    // of the order. That is two surfaces disagreeing about one book — the book page showing no
    // number while the series page shows #10 — which is precisely the defect set_series_order
    // exists to close, codified here as an expectation.
    //
    // The new contract is forced by the schema rather than chosen: `series_entries.position` is
    // NOT NULL, so a live slot is always SOMEWHERE. Clearing the field therefore means "I don't
    // know where this goes", the slot goes to the end, and `books.position` — a synced copy, not
    // an independent value — mirrors it. A book in a structured series no longer has an
    // unnumbered state to be in.
    //
    // So the assertion is now the INVARIANT itself: the two agree, and neither is the stale 9.
    // Asserting only "the entry is no longer 9" would pass with the mirror broken entirely.
    await setPosition(ids[1]!, 'Audit Bravo', '')
    await expect
      .poll(
        async () => {
          const book = (await bookRow(c, 'Audit Bravo'))?.position
          const entry = (await liveEntries(c)).find((e) => e.title === 'Audit Bravo')?.position
          return { book, entry, agree: book != null && book === entry }
        },
        { timeout: 15_000 },
      )
      .toMatchObject({ agree: true })

    const clearedEntry = (await liveEntries(c)).find((e) => e.title === 'Audit Bravo')?.position
    const clearedBook = (await bookRow(c, 'Audit Bravo'))?.position
    expect(clearedEntry, 'the cleared slot went to the end, not back to its old number').not.toBe(9)
    expect(clearedBook, 'books.position mirrors the slot rather than going blank').toBe(
      clearedEntry,
    )
  } finally {
    await reset(c)
  }
})

// ── fix/revive-author-match: WHICH tombstone a re-added book revives, when more than one could be
//    the answer. Two same-title tombstones is a reissue, an unmerged import duplicate, or a
//    translation; reviving the wrong one resurrects a slot the reader deliberately removed, in the
//    reading order, silently. Author breaks the tie; an unbreakable tie revives nothing.
test('reconciliation revives the same-title tombstone whose AUTHOR matches the book', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  await seedSeries(c)
  await stubBackends(page)
  try {
    await signIn(page, c.session)
    await openSeries(page) // materialize the three seeded entries first
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(3)

    // Two tombstones, same title, different authors. Only one is the right answer.
    const wrong = await insertTombstone(c, {
      title: 'Twin Slot',
      author: 'Wrong Author',
      position: 7,
    })
    const right = await insertTombstone(c, {
      title: 'Twin Slot',
      author: 'Vera Quill',
      position: 8,
    })
    // ...and the book the reader just added back, by the second author.
    await seedExtraBook(c, 'Twin Slot', 'Vera', 'Quill')

    await openSeries(page)
    await expect
      .poll(async () => (await liveEntries(c)).some((e) => e.title === 'Twin Slot'), {
        timeout: 20_000,
      })
      .toBe(true)

    const twins = await entriesByTitle(c, 'Twin Slot')
    const revived = twins.filter((t) => t.removed_at === null)
    expect(revived).toHaveLength(1)
    // The IDENTITY is the assertion — a test that only counted revivals would pass on either choice.
    expect(revived[0]!.id).toBe(right)
    expect(revived[0]!.author).toBe('Vera Quill')
    expect(twins.find((t) => t.id === wrong)?.removed_at).toBeTruthy()
  } finally {
    await reset(c)
  }
})

test('reconciliation revives NOTHING when two same-title tombstones cannot be told apart', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  await seedSeries(c)
  await stubBackends(page)
  try {
    await signIn(page, c.session)
    await openSeries(page)
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(3)

    // Both tombstones have an EMPTY author — the legitimate state a manual ghost lands in when the
    // reader skips the optional author prompt. Nothing on either row can discriminate.
    const a = await insertTombstone(c, { title: 'Twin Slot', author: '', position: 7 })
    const b = await insertTombstone(c, { title: 'Twin Slot', author: '', position: 8 })
    await seedExtraBook(c, 'Twin Slot', 'Vera', 'Quill')

    await openSeries(page)
    // The book still reaches the series — it just gets a NEW slot instead of claiming a tombstone.
    await expect
      .poll(async () => (await liveEntries(c)).some((e) => e.title === 'Twin Slot'), {
        timeout: 20_000,
      })
      .toBe(true)

    const twins = await entriesByTitle(c, 'Twin Slot')
    // Three rows now: the two untouched tombstones plus the freshly seeded live entry.
    expect(twins).toHaveLength(3)
    expect(twins.find((t) => t.id === a)?.removed_at).toBeTruthy()
    expect(twins.find((t) => t.id === b)?.removed_at).toBeTruthy()
    const live = twins.filter((t) => t.removed_at === null)
    expect(live).toHaveLength(1)
    expect(live[0]!.id).not.toBe(a)
    expect(live[0]!.id).not.toBe(b)
    expect(live[0]!.book_id).toBeTruthy() // a real linked slot, not a resurrected ghost
  } finally {
    await reset(c)
  }
})

// The OTHER revive path, and the one that matters most: revivedTombstone is reached by an explicit
// reader gesture ("＋ One you don't have yet"), so a wrong match here attaches the reader's own add
// to a slot they deliberately removed. Driven through the real prompts, not the data layer.
test('an explicit ghost add revives the author-matching tombstone, and refuses an unbreakable tie', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  await seedSeries(c)
  await stubBackends(page)
  try {
    await signIn(page, c.session)
    await openSeries(page)
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(3)

    // ── Part 1: distinguishable — the add must land on the right tombstone.
    const wrong = await insertTombstone(c, {
      title: 'Ghost Twin',
      author: 'Wrong Author',
      position: 7,
    })
    const right = await insertTombstone(c, {
      title: 'Ghost Twin',
      author: 'Vera Quill',
      position: 8,
    })

    const prompts = ['Ghost Twin', 'Vera Quill']
    page.on('dialog', (d) => void d.accept(prompts.shift() ?? ''))
    await page.getByRole('button', { name: /One you don’t have yet/i }).click()
    await expect(page.locator('ol li').filter({ hasText: 'Ghost Twin' })).toBeVisible({
      timeout: 20_000,
    })

    const twins = await entriesByTitle(c, 'Ghost Twin')
    const revived = twins.filter((t) => t.removed_at === null)
    expect(revived).toHaveLength(1)
    expect(revived[0]!.id).toBe(right)
    expect(twins.find((t) => t.id === wrong)?.removed_at).toBeTruthy()
    // Reusing the tombstone rather than inserting beside it is the whole point of this path.
    expect(twins).toHaveLength(2)

    // ── Part 2: indistinguishable — the add must NOT claim either tombstone.
    const c1 = await insertTombstone(c, { title: 'Tied Twin', author: 'Same Name', position: 11 })
    const c2 = await insertTombstone(c, { title: 'Tied Twin', author: 'Same Name', position: 12 })

    prompts.push('Tied Twin', 'Same Name')
    await page.getByRole('button', { name: /One you don’t have yet/i }).click()
    await expect(page.locator('ol li').filter({ hasText: 'Tied Twin' })).toBeVisible({
      timeout: 20_000,
    })

    const tied = await entriesByTitle(c, 'Tied Twin')
    expect(tied).toHaveLength(3) // both tombstones intact + one new ghost
    expect(tied.find((t) => t.id === c1)?.removed_at).toBeTruthy()
    expect(tied.find((t) => t.id === c2)?.removed_at).toBeTruthy()
    const fresh = tied.filter((t) => t.removed_at === null)
    expect(fresh).toHaveLength(1)
    expect(fresh[0]!.id).not.toBe(c1)
    expect(fresh[0]!.id).not.toBe(c2)
  } finally {
    await reset(c)
  }
})

// ── fix/ghost-adoption-match: the INTERACTION the backlog entry named. Adoption runs before revive
//    in the same reconciliation and consumes the book from `linked`, so an adoption that guesses can
//    override a revive that doesn't. This is that sequence end to end, not a proxy for it.
test('an ambiguous ghost adoption does not consume the book that revive would claim', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  await seedSeries(c)
  await stubBackends(page)
  try {
    await signIn(page, c.session)
    await openSeries(page) // materialize the three seeded entries
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(3)

    // Two LIVE ghosts share a title and cannot be told apart — adoption must refuse.
    const ghostA = await insertGhost(c, { title: 'Twin Ghost', author: '', position: 6 })
    const ghostB = await insertGhost(c, { title: 'Twin Ghost', author: '', position: 7 })
    // A tombstone with the same title whose author DOES match the book — revive's rightful claim.
    const tomb = await insertTombstone(c, {
      title: 'Twin Ghost',
      author: 'Vera Quill',
      position: 8,
    })
    await seedExtraBook(c, 'Twin Ghost', 'Vera', 'Quill')

    await openSeries(page)
    await expect
      .poll(async () => (await entriesByTitle(c, 'Twin Ghost')).some((e) => e.book_id !== null), {
        timeout: 20_000,
      })
      .toBe(true)

    const rows = await entriesByTitle(c, 'Twin Ghost')
    const byId = new Map(rows.map((r) => [r.id, r]))

    // Neither ghost may take the book. Under the old title-only adoption, one of them would have —
    // and `.find` took the first, so it would have been ghostA.
    expect(byId.get(ghostA)?.book_id).toBeNull()
    expect(byId.get(ghostB)?.book_id).toBeNull()

    // ...and the tombstone gets the book instead: revived, linked, no longer removed.
    expect(byId.get(tomb)?.removed_at).toBeNull()
    expect(byId.get(tomb)?.book_id).toBeTruthy()
    // The identity matters — a count-only assertion would pass on the wrong row claiming it.
    const theBook = await bookRow(c, 'Twin Ghost')
    expect(byId.get(tomb)?.book_id).toBe(theBook?.id)
  } finally {
    await reset(c)
  }
})

// The relocated `bookId == null` guard, at the call site where it now lives. Dropping the
// `unlinkedEntries` filter would let a second book re-point an entry that already belongs to the
// first — orphaning that book's slot silently. A unique title makes the match unambiguous, so only
// the filter stands between this book and someone else's entry.
test('a book cannot claim an entry that already belongs to a different book', async ({ page }) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  await seedSeries(c)
  await stubBackends(page)
  try {
    await signIn(page, c.session)
    await openSeries(page)
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(3)

    // 'Audit Alpha' already has its own entry, linked to its own book, from the seeding above.
    const before = (await entriesByTitle(c, 'Audit Alpha'))[0]!
    expect(before.book_id).toBeTruthy()

    // A SECOND book with the same title joins the series — the shape a reissue or an unmerged
    // import duplicate produces.
    const secondId = await seedExtraBook(c, 'Audit Alpha', 'Nell', 'Marrow')

    await openSeries(page)
    await expect
      .poll(async () => (await entriesByTitle(c, 'Audit Alpha')).length, { timeout: 20_000 })
      .toBe(2)

    const after = await entriesByTitle(c, 'Audit Alpha')
    const original = after.find((e) => e.id === before.id)
    // The original entry still points at the ORIGINAL book — not re-pointed at the newcomer.
    expect(original?.book_id).toBe(before.book_id)
    expect(original?.book_id).not.toBe(secondId)
    // The second book got a slot of its own rather than stealing one.
    const other = after.find((e) => e.id !== before.id)
    expect(other?.book_id).toBe(secondId)
  } finally {
    await reset(c)
  }
})

// ── 20260821010000: a colliding source move is SKIPPED, and the rest of the refresh still applies ──
// The collision is built deliberately: the catalog reports Alpha at the position a READER-ARRANGED
// entry (Bravo) already holds, and Charlie at a free one. Before the migration the whole RPC raised
// on Alpha's collision — the mutation errored, the note read as a network failure, and Charlie's
// perfectly good correction was lost with it. The assertions are the surviving arrangement and the
// skip being said out loud, not merely that the call returned ok.
test('a colliding source move skips that move only — the rest of the refresh lands', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  // Alpha@2, Bravo@3, Charlie@5 — the catalog will ask Alpha→3 (taken) and Charlie→4 (free).
  await seedSeries(c, [2, 3, 5])
  await stubBackends(page)
  // Registered AFTER stubBackends, so it wins (Playwright matches newest route first): the catalog
  // names only Alpha and Charlie, so Bravo is never in the batch — it is the OUTSIDE occupant.
  await page.route('**/functions/v1/series**', (r) =>
    r.fulfill({
      json: {
        sourceRef: 'stub',
        entries: [
          { position: 3, title: 'Audit Alpha', author: 'Nell Marrow' },
          { position: 4, title: 'Audit Charlie', author: 'Nell Marrow' },
        ],
      },
    }),
  )
  try {
    await signIn(page, c.session)
    await openSeries(page)
    await expect.poll(async () => (await liveEntries(c)).length, { timeout: 20_000 }).toBe(3)

    // Bravo becomes reader-arranged, directly — the state the server's user_edited filter reads.
    // Its position (3) is exactly where the catalog wants Alpha, which is the collision.
    const bravo = await entryByTitle(c, 'Audit Bravo')
    await ok(
      c.sb.from('series_entries').update({ user_edited: true }).eq('id', bravo!.id),
      'collision test: mark Bravo reader-arranged',
    )

    await page.getByRole('button', { name: /Fetch series data/i }).click()

    // The skip is reported to the reader — this note is unreachable if the RPC aborts (the error
    // path says "Couldn't reach the catalog just now." instead).
    await expect(page.getByText(/1 skipped — its catalog position is already taken/i)).toBeVisible({
      timeout: 20_000,
    })

    // The surviving arrangement: Alpha's colliding move did NOT apply, Bravo was never renumbered
    // out of the way, and Charlie's clean move in the SAME batch landed — the anti-abort witness.
    await expect
      .poll(async () => (await liveEntries(c)).map((e) => `${e.title}@${e.position}`), {
        timeout: 15_000,
      })
      .toEqual(['Audit Alpha@2', 'Audit Bravo@3', 'Audit Charlie@4'])

    // books.position mirrored for the move that landed, in the same transaction.
    expect((await bookRow(c, 'Audit Charlie'))?.position).toBe(4)
    expect((await bookRow(c, 'Audit Alpha'))?.position).toBe(2)
  } finally {
    await reset(c)
  }
})
