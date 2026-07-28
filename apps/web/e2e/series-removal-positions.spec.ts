import { expect, test, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { authFailure } from './support/authError'

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
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data } = await admin.auth.admin.listUsers()
  let uid = data?.users?.find((u) => u.email === TEST_EMAIL)?.id
  if (!uid) {
    const { data: created, error } = await admin.auth.admin.createUser({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true })
    if (error) throw error
    uid = created.user!.id
  }
  await admin.from('profiles').upsert({ id: uid, display_name: 'Series Defects E2E', skin: 'tryst', mode: 'system' })
}

type Client = { sb: SupabaseClient; session: { access_token: string; refresh_token: string }; uid: string }
let shared: Client | null = null
async function client(): Promise<Client> {
  if (shared) return shared
  await ensureUser()
  const sb = createClient(SUPABASE_URL, ANON)
  const { data, error } = await sb.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD })
  if (error || !data.session) throw new Error(authFailure('series-removal-positions', TEST_EMAIL, error))
  shared = { sb, session: data.session, uid: data.session.user.id }
  return shared
}

async function reset(c: Client) {
  const { data: books } = await c.sb.from('books').select('id').eq('owner_id', c.uid)
  const ids = ((books as { id: string }[]) ?? []).map((b) => b.id)
  if (ids.length) {
    await c.sb.from('list_items').delete().in('book_id', ids)
    await c.sb.from('books').delete().in('id', ids)
  }
  const { data: ser } = await c.sb.from('series').select('id').eq('owner_id', c.uid)
  const sids = ((ser as { id: string }[]) ?? []).map((s) => s.id)
  if (sids.length) await c.sb.from('series_entries').delete().in('series_id', sids)
  await c.sb.from('series').delete().eq('owner_id', c.uid)
  await c.sb.from('lists').delete().eq('owner_id', c.uid)
}

async function signIn(page: Page, session: { access_token: string; refresh_token: string }) {
  await page.addInitScript(() => localStorage.setItem('reverie.onboarded', '1'))
  await page.goto(`/#access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`)
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
  await page.route('**/functions/v1/covers**', (r) => r.fulfill({ status: 422, json: { error: 'fetch_failed' } }))
  await page.route('**/functions/v1/embed**', (r) => r.fulfill({ json: { hasTaste: false, scores: [] } }))
  await page.route('**/functions/v1/releases**', (r) => r.fulfill({ json: { hits: [] } }))
  await page.route('**/functions/v1/series**', (r) => r.fulfill({ json: { sourceRef: 'stub', entries: SOURCE_ENTRIES } }))
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
  const { data: s } = await c.sb.from('series').select('id').eq('owner_id', c.uid).eq('name', SERIES).maybeSingle()
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
  (await c.sb.from('books').select('id, series, position').eq('owner_id', c.uid).eq('title', title).maybeSingle()).data as
    | { id: string; series: string | null; position: number | null }
    | null

const badges = (page: Page) => page.locator('ol li span.text-\\[15px\\].font-bold').allTextContents()
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

    await expect.poll(async () => (await liveEntries(c)).map((e) => e.title), { timeout: 15_000 }).toEqual([
      'Audit Alpha',
      'Audit Charlie',
    ])
    // The book keeps existing; it just stops naming the series. useRemoveEntry writes
    // series_entries and books.series as two SEPARATE, sequential round trips within one mutation —
    // not one transaction — so a reader querying independently (this test's own client, not the
    // app's own invalidation-gated view) can observe the first commit before the second lands. Poll,
    // matching the liveEntries wait just above, rather than assuming both are visible atomically.
    await expect.poll(async () => (await bookRow(c, 'Audit Bravo'))?.series, { timeout: 15_000 }).toBeFalsy()

    // Survives a full reload — reconciliation must not re-add it.
    await page.reload()
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(2)
    expect(await page.locator('ol li').filter({ hasText: 'Audit Bravo' }).count()).toBe(0)
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
    await expect(page.getByRole('heading', { name: 'Audit Alpha' })).toBeVisible({ timeout: 20_000 })
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
      .poll(async () => (await liveEntries(c)).find((e) => e.title === 'Phantom Tome')?.book_id ?? null, { timeout: 15_000 })
      .not.toBeNull()

    // Still removable now that it's a real book.
    const linkedRow = page.locator('ol li').filter({ hasText: 'Phantom Tome' })
    await linkedRow.getByRole('button', { name: /Remove Phantom Tome from the series/i }).click()
    await page.getByRole('dialog', { name: /Remove from this series/i }).getByRole('button', { name: /^Remove$/ }).click()

    await expect
      .poll(async () => (await liveEntries(c)).some((e) => e.title === 'Phantom Tome'), { timeout: 15_000 })
      .toBe(false)
  } finally {
    await reset(c)
  }
})

// ── Defect 1: clearing the series field on the book page removes the slot outright ──
test('book page: clearing the series field removes the slot, not just the link', async ({ page }) => {
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
    await expect(page.getByRole('heading', { name: 'Audit Charlie' })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: /^Edit details$/i }).click()
    const dialog = page.getByRole('dialog', { name: /Edit details/i })
    await dialog.locator('label', { hasText: /^Series$/ }).locator('input').fill('')

    // Naming the consequence before it happens.
    await dialog.getByRole('button', { name: /Save details/i }).click()
    await expect(dialog.getByText(/removes the book’s slot from Audit Cycle/i)).toBeVisible()
    await dialog.getByRole('button', { name: /Save and remove/i }).click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })

    await expect.poll(async () => (await liveEntries(c)).map((e) => e.title), { timeout: 15_000 }).toEqual([
      'Audit Alpha',
      'Audit Bravo',
    ])
    expect((await bookRow(c, 'Audit Charlie'))?.series).toBeFalsy()

    // The series page must not show it at all — not as a book, and not as a leftover ghost slot.
    await openSeries(page)
    await expect.poll(async () => page.locator('ol li').count(), { timeout: 20_000 }).toBe(2)
    expect(await page.locator('ol li').filter({ hasText: 'Audit Charlie' }).count()).toBe(0)

    // And the book page stops advertising the series.
    await page.goto(`/book/${ids[2]}`)
    await expect(page.getByRole('heading', { name: 'Audit Charlie' })).toBeVisible({ timeout: 20_000 })
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

    await page.locator('ol li').filter({ hasText: 'Audit Bravo' }).getByRole('button', { name: /Remove Audit Bravo/i }).click()
    await page.getByRole('dialog', { name: /Remove from this series/i }).getByRole('button', { name: /^Remove$/ }).click()
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
    expect((await liveEntries(c)).map((e) => e.title)).toEqual(['Audit Bravo', 'Audit Alpha', 'Audit Charlie'])
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
    expect((await liveEntries(c)).map((e) => e.title)).toEqual(['Audit Alpha', 'Audit Bravo', 'Audit Charlie'])
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
      await dlg.locator('label', { hasText: /^Position$/ }).locator('input').fill(value)
      await dlg.getByRole('button', { name: /Save details/i }).click()
      await expect(dlg).toBeHidden({ timeout: 15_000 })
    }

    await setPosition(ids[1]!, 'Audit Bravo', '9')
    await expect.poll(async () => (await bookRow(c, 'Audit Bravo'))?.position, { timeout: 15_000 }).toBe(9)
    // Wait for the SERIES side too before leaving the page. useSyncBookSeries is chained after
    // updateBook, so the book row lands first; navigating between the two would tear down the page
    // mid-mutation and the guard below would be measuring a lost write, not a stale repaint.
    await expect
      .poll(async () => (await liveEntries(c)).find((e) => e.title === 'Audit Bravo')?.position, { timeout: 15_000 })
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
    await expect.poll(async () => (await bookRow(c, 'Audit Alpha'))?.position, { timeout: 15_000 }).toBe(0)
    await expect
      .poll(async () => (await liveEntries(c)).find((e) => e.title === 'Audit Alpha')?.position, { timeout: 15_000 })
      .toBe(0)

    // 3d: clearing the field must not leave the old number standing on the series side.
    await setPosition(ids[1]!, 'Audit Bravo', '')
    await expect.poll(async () => (await bookRow(c, 'Audit Bravo'))?.position, { timeout: 15_000 }).toBeNull()
    await expect
      .poll(async () => (await liveEntries(c)).find((e) => e.title === 'Audit Bravo')?.position, { timeout: 15_000 })
      .not.toBe(9)
  } finally {
    await reset(c)
  }
})
