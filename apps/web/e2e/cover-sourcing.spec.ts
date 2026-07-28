import { expect, test, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { authFailure } from './support/authError'

// Cover sourcing posture (docs/reverie-metadata-sourcing.md §Covers).
//
// Google Books' terms prohibit permanent copies and caching beyond the cache header, but the ingest
// pipeline stored whatever it was given — and the lazy backfill quietly fed it every hotlinked cover
// a book had, Google's included, on the next visit to the book's page. These guards assert the line
// in the real UI: Google renders, Google is never fetched into Storage, and the reader's own camera
// capture is the promoted path.

const SUPABASE_URL = 'http://127.0.0.1:55321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const EMAIL = 'cover-sourcing-e2e@reverie.local'
const PASSWORD = 'cover-sourcing-e2e-password'

const GOOGLE_COVER = 'https://books.google.com/books/content?id=probe123&printsec=frontcover&img=1&zoom=1'
const OL_COVER = 'https://covers.openlibrary.org/b/id/240727-M.jpg'

test.describe.configure({ mode: 'serial' })

type Client = { sb: SupabaseClient; session: { access_token: string; refresh_token: string }; uid: string }
let shared: Client | null = null
async function client(): Promise<Client> {
  if (shared) return shared
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data } = await admin.auth.admin.listUsers()
  let uid = data?.users?.find((u) => u.email === EMAIL)?.id
  if (!uid) uid = (await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true })).data.user!.id
  await admin.from('profiles').upsert({ id: uid, display_name: 'Cover Sourcing', skin: 'tryst', mode: 'system' })
  const sb = createClient(SUPABASE_URL, ANON)
  const { data: s, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error || !s.session) throw new Error(authFailure('cover-sourcing', EMAIL, error))
  shared = { sb, session: s.session, uid: s.session.user.id }
  return shared
}

async function reset(c: Client) {
  const { data: books } = await c.sb.from('books').select('id').eq('owner_id', c.uid)
  const ids = ((books as { id: string }[]) ?? []).map((b) => b.id)
  if (ids.length) await c.sb.from('books').delete().in('id', ids)
}

async function signIn(page: Page, session: { access_token: string; refresh_token: string }) {
  await page.addInitScript(() => localStorage.setItem('reverie.onboarded', '1'))
  await page.goto(`/#access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`)
  await page.getByRole('button', { name: /enter your library/i }).click({ timeout: 20_000 })
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => indexedDB.deleteDatabase('reverie-offline'))
}

/** Count every call at the ingest pipeline, and serve stub images so nothing hits the real hosts. */
function watchIngest(page: Page) {
  const calls: string[] = []
  void page.route('**/functions/v1/covers**', async (r) => {
    const body = r.request().postData() ?? ''
    calls.push(body.slice(0, 400))
    await r.fulfill({ json: { editions: [] } })
  })
  return calls
}

async function stub(page: Page) {
  for (const p of ['search', 'enrich', 'embed', 'releases', 'series'])
    await page.route(`**/functions/v1/${p}**`, (r) => r.fulfill({ json: {} }))
  await page.route('**/books/v1/volumes**', (r) => r.fulfill({ json: { items: [] } }))
  // A 1x1 gif for any external cover host, so rendering never depends on the network.
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')
  await page.route(/(books\.google|googleusercontent|covers\.openlibrary)/, (r) =>
    r.fulfill({ contentType: 'image/gif', body: gif }),
  )
}

const makeBook = async (c: Client, patch: Record<string, unknown> = {}) => {
  const { data, error } = await c.sb
    .from('books')
    .insert({
      owner_id: c.uid,
      title: 'Sourcing Probe',
      author_first: 'Nell',
      author_last: 'Marrow',
      genre: 'fantasy',
      ownership: 'owned',
      status: 'standalone',
      ...patch,
    })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

const coverOf = async (c: Client, id: string) =>
  (await c.sb.from('books').select('cover_url, cover_source, cover_source_url, cover_thumb_url').eq('id', id).single())
    .data as { cover_url: string | null; cover_source: string | null; cover_source_url: string | null }

// ── The main leak: the lazy backfill must not sweep a Google cover into Storage ──
test('a Google-hosted cover is never ingested by the lazy backfill', async ({ page }) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  const id = await makeBook(c, { cover_url: GOOGLE_COVER })
  await stub(page)
  const ingestCalls = watchIngest(page)
  try {
    await signIn(page, c.session)
    await page.goto(`/book/${id}`)
    await expect(page.getByRole('heading', { name: 'Sourcing Probe' })).toBeVisible({ timeout: 20_000 })
    // The backfill fires on view — give it room to misbehave.
    await page.waitForTimeout(4000)

    const ingests = ingestCalls.filter((b) => b.includes('"action":"ingest"'))
    expect(ingests, `ingest was called with: ${JSON.stringify(ingests)}`).toEqual([])

    // Untouched in the DB: still the hotlink, still no stored asset.
    const row = await coverOf(c, id)
    expect(row.cover_url).toBe(GOOGLE_COVER)
    expect(row.cover_url).not.toContain('/storage/v1/object/public/covers/')

    // And it still RENDERS — display was never the problem.
    await expect(page.locator('img[alt=""]').first()).toBeVisible()
  } finally {
    await reset(c)
  }
})

// ── The defensible source is still swept in, exactly as before ──
test('an Open Library cover is still ingested by the backfill', async ({ page }) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  const id = await makeBook(c, { cover_url: OL_COVER })
  await stub(page)
  const ingestCalls = watchIngest(page)
  try {
    await signIn(page, c.session)
    await page.goto(`/book/${id}`)
    await expect(page.getByRole('heading', { name: 'Sourcing Probe' })).toBeVisible({ timeout: 20_000 })
    await expect
      .poll(() => ingestCalls.filter((b) => b.includes('"action":"ingest"')).length, { timeout: 20_000 })
      .toBeGreaterThan(0)
    const body = ingestCalls.find((b) => b.includes('"action":"ingest"')) ?? ''
    expect(body).toContain('covers.openlibrary.org')
  } finally {
    await reset(c)
  }
})

// ── Camera capture leads the sheet ──
test('the cover sheet leads with photographing your own copy', async ({ page }) => {
  test.setTimeout(180_000)
  const c = await client()
  await reset(c)
  const id = await makeBook(c, { cover_url: OL_COVER })
  await stub(page)
  try {
    await signIn(page, c.session)
    await page.goto(`/book/${id}`)
    await expect(page.getByRole('heading', { name: 'Sourcing Probe' })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: /Change cover/i }).first().click()
    const sheet = page.getByRole('dialog', { name: 'Cover' })
    await expect(sheet).toBeVisible({ timeout: 15_000 })

    const photo = sheet.getByRole('button', { name: /Photograph your copy/i })
    await expect(photo).toBeVisible()
    await expect(sheet.getByText(/the one on your shelf/i)).toBeVisible()

    // "Your copy" must come BEFORE "Other editions" in the document, not after it.
    const order = await sheet.evaluate((el) => {
      // innerText applies the section labels' CSS uppercase transform — compare case-insensitively.
      const text = (el as HTMLElement).innerText.toLowerCase()
      return { your: text.indexOf('your copy'), editions: text.indexOf('other editions') }
    })
    expect(order.your).toBeGreaterThanOrEqual(0)
    expect(order.editions).toBeGreaterThan(order.your)
  } finally {
    await reset(c)
  }
})
