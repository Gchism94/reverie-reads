import { expect, test, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Regression guards for docs/task-shelf-regressions.md — the two capabilities that shipped at #48/#49
// and silently broke:
//   1. Adding a book you do NOT own to a shelf from the SHELVES page (/shelves), via that page's own
//      picker → "search everywhere" seam. The seam was wired into the shelf DETAIL page at #55 but the
//      /shelves picker never got it, so the "Search everywhere" button stays disabled there.
//   2. Reorder within a shelf by drag — the cover <img> is natively draggable and hijacked the reorder
//      gesture after #58 turned spine/shelf covers from CSS backgrounds into <img> (fixed with
//      draggable={false}); the keyboard fallback must reorder and persist.
// Both FAIL against the pre-fix build. The `search`/`enrich` edge fns are stubbed for determinism (the
// real backend is exercised in the eyeball); a dedicated throwaway user keeps the seed untouched.

const SUPABASE_URL = 'http://127.0.0.1:55321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const TEST_EMAIL = 'shelf-regress-e2e@reverie.local'
const TEST_PASSWORD = 'shelf-regress-e2e-password'

test.describe.configure({ mode: 'serial' })

const STUB_RESULTS = [
  {
    source: 'hardcover',
    title: 'Wildfire Vow',
    authors: ['Imogen Vale'],
    cover: '/landing-covers/everflame.jpg',
    isbn: '9780316580792',
    isbn13: '9780316580792',
    year: '2023',
    series: 'Emberwild',
    seriesPosition: 1,
  },
]

async function ensureUser(): Promise<void> {
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data } = await admin.auth.admin.listUsers()
  let uid = data?.users?.find((u) => u.email === TEST_EMAIL)?.id
  if (!uid) {
    const { data: created, error } = await admin.auth.admin.createUser({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true })
    if (error) throw error
    uid = created.user!.id
  }
  await admin.from('profiles').upsert({ id: uid, display_name: 'Shelf Regress E2E', skin: 'tryst', mode: 'system' })
}

type Client = { sb: SupabaseClient; session: { access_token: string; refresh_token: string }; uid: string }

let shared: Client | null = null
async function client(): Promise<Client> {
  if (shared) return shared
  await ensureUser()
  const sb = createClient(SUPABASE_URL, ANON)
  const { data, error } = await sb.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD })
  if (error || !data.session) throw new Error(`sign-in failed: ${error?.message}`)
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
  await c.sb.from('lists').delete().eq('owner_id', c.uid)
}

async function signIn(page: Page, session: { access_token: string; refresh_token: string }) {
  await page.addInitScript(() => localStorage.setItem('reverie.onboarded', '1'))
  await page.goto(`/#access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`)
  await page.getByRole('button', { name: /enter your library/i }).click({ timeout: 20_000 })
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => indexedDB.deleteDatabase('reverie-offline'))
}

async function stubBackends(page: Page) {
  await page.route('**/functions/v1/search**', (r) => r.fulfill({ json: { results: STUB_RESULTS } }))
  await page.route('**/functions/v1/enrich**', (r) => r.fulfill({ json: { rateLimited: false } }))
  await page.route('**/functions/v1/covers**', (r) => r.fulfill({ status: 422, json: { error: 'fetch_failed' } }))
  await page.route('**/functions/v1/embed**', (r) => r.fulfill({ json: { hasTaste: false, scores: [] } }))
  await page.route('**/functions/v1/releases**', (r) => r.fulfill({ json: { hits: [] } }))
  await page.route('**/books/v1/volumes**', (r) => r.fulfill({ json: { items: [] } }))
}

const bookByTitle = async (sb: SupabaseClient, uid: string, title: string) =>
  (await sb.from('books').select('id, ownership').eq('owner_id', uid).eq('title', title).maybeSingle()).data as
    | { id: string; ownership: string }
    | null

const positionsFor = async (sb: SupabaseClient, listId: string) =>
  ((await sb.from('list_items').select('book_id, position').eq('list_id', listId).order('position')).data ?? []) as {
    book_id: string
    position: number
  }[]

// ── Regression 1: add an unowned book to a shelf from the /shelves page, never visiting the book page ──
test('Shelves page: "search everywhere" adds an unowned book to a shelf (regression: seam missing on /shelves)', async ({ page }) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  const { data: list } = await c.sb.from('lists').insert({ owner_id: c.uid, name: 'Regress TBR', kind: 'tbr' }).select('id').single()
  const listId = (list as { id: string }).id
  await stubBackends(page)
  try {
    await signIn(page, c.session)
    await page.goto('/shelves')

    // Open the empty shelf's own picker from the Shelves page (NOT the detail page, NOT a book page).
    await page.getByRole('button', { name: /add the first/i }).click()
    const picker = page.getByRole('dialog', { name: /Add to Regress TBR/i })
    await expect(picker).toBeVisible()

    // The seam: pre-fix this button is DISABLED ("coming soon") so the click can't land within the
    // bounded wait → the test fails, exactly the regression. Post-fix it opens the external-search sheet.
    await picker.getByRole('button', { name: /Search everywhere/i }).click({ timeout: 15_000 })

    const sheet = page.getByRole('dialog', { name: /Search everywhere · Regress TBR/i })
    await expect(sheet).toBeVisible()
    await sheet.getByLabel('Search the wider catalog').fill('wildfire')
    await expect(sheet.getByText('Wildfire Vow')).toBeVisible({ timeout: 15_000 })
    await sheet.getByRole('button', { name: '＋ Add', exact: true }).first().click()

    // Lands on the shelf as unowned — never having opened the book's detail page.
    await expect
      .poll(
        async () => {
          const b = await bookByTitle(c.sb, c.uid, 'Wildfire Vow')
          if (!b) return 0
          const { count } = await c.sb.from('list_items').select('book_id', { count: 'exact', head: true }).eq('list_id', listId).eq('book_id', b.id)
          return count ?? 0
        },
        { timeout: 15_000 },
      )
      .toBe(1)
    expect((await bookByTitle(c.sb, c.uid, 'Wildfire Vow'))?.ownership).toBe('unowned')
    expect(page.url()).not.toContain('/book/') // proved we never visited the book page
  } finally {
    await reset(c)
  }
})

// ── Regression 2: reorder within a shelf — covers must not hijack the drag; keyboard reorder persists ──
test('Shelf reorder: covers are not drag-hijackable and the keyboard fallback reorders + persists', async ({ page }) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  const { data: list } = await c.sb.from('lists').insert({ owner_id: c.uid, name: 'Order Shelf', kind: 'tbr' }).select('id').single()
  const listId = (list as { id: string }).id
  // three owned books with covers (so CoverImage renders an <img>), spaced positions
  const titles = ['Alpha Book', 'Bravo Book', 'Charlie Book']
  for (let i = 0; i < titles.length; i++) {
    const { data: b } = await c.sb
      .from('books')
      .insert({ owner_id: c.uid, title: titles[i], author_first: 'Test', author_last: 'Author', ownership: 'owned', cover_url: '/landing-covers/everflame.jpg' })
      .select('id')
      .single()
    await c.sb.from('list_items').insert({ list_id: listId, book_id: (b as { id: string }).id, owner_id: c.uid, position: (i + 1) * 1000 })
  }
  await stubBackends(page)
  try {
    await signIn(page, c.session)
    await page.goto(`/shelf/${listId}`)
    await page.getByRole('button', { name: 'Grid', exact: true }).click()

    // The #58 regression guard: cover images inside the reorder grid must NOT be natively draggable,
    // or the browser hijacks the reorder drag with an image drag. Pre-fix (<img> with no draggable
    // attr) this fails; post-fix (draggable={false}) it passes.
    const covers = page.locator('img[alt=""]')
    await expect(covers.first()).toBeVisible()
    const draggables = await covers.evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).draggable))
    expect(draggables.every((d) => d === false)).toBe(true)

    // Keyboard fallback: move the first book (Alpha) one step later → Bravo leads. Persist + survive reload.
    const orderTitles = async () => {
      const rows = await positionsFor(c.sb, listId)
      const byId = new Map(
        ((await c.sb.from('books').select('id, title').eq('owner_id', c.uid)).data ?? []).map((b) => [(b as { id: string }).id, (b as { title: string }).title]),
      )
      return rows.map((r) => byId.get(r.book_id))
    }
    expect(await orderTitles()).toEqual(['Alpha Book', 'Bravo Book', 'Charlie Book'])

    await page.getByRole('button', { name: 'Move Alpha Book later' }).click()
    await expect.poll(orderTitles, { timeout: 15_000 }).toEqual(['Bravo Book', 'Alpha Book', 'Charlie Book'])

    // survives a full reload (persistence, not just optimistic UI)
    await page.reload()
    await page.getByRole('button', { name: 'Grid', exact: true }).click()
    await expect(page.getByText('Bravo Book')).toBeVisible()
    expect(await orderTitles()).toEqual(['Bravo Book', 'Alpha Book', 'Charlie Book'])
  } finally {
    await reset(c)
  }
})
