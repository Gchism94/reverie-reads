import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { authFailure } from './support/authError'

// Shelf membership against the REAL seeded library (docs/task-shelf-model.md).
//
// This assertion has never existed, and its absence is why three empty shelves shipped unnoticed:
// `scripts/seed-dev.mjs` never wrote `ownership`, so all 290 seeded books took the column default
// ('unset' after ownership-v2), every one of them failed the in-hand gate in bookOwnedFormats, and
// Shelves rendered "Flip a copy switch on a book and it lands here" three times over a library of
// 290 books. Nothing was red. No test asked how many books were on a shelf.
//
// So this test asks. It derives what each shelf SHOULD hold straight from data/personal_seed.json
// using the documented provenance rule, independently of the app's code path, then reads the counts
// the reader actually sees. The two sides only agree if the whole chain works: seed script → DB
// columns → row mapper → possession predicate → the shelf's filter → the DOM.

const SUPABASE_URL = 'http://127.0.0.1:55321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const DEV_EMAIL = 'shelf-membership-e2e@reverie.local'
const DEV_PASSWORD = 'shelf-membership-e2e-password'

test.describe.configure({ mode: 'serial' })

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

/** Give this spec's own user the full seeded library, through the one seeding implementation the
 *  repo has. Idempotent — a re-run replaces this user's books. */
function seedOwnLibrary(): void {
  execFileSync('node', ['scripts/seed-dev.mjs'], {
    cwd: repoRoot,
    env: { ...process.env, DEV_EMAIL, DEV_PASSWORD },
    stdio: 'pipe',
  })
}

/**
 * What the three format shelves must hold, derived from the seed JSON by the rule the seed script
 * documents: `source` gives possession ('Owned' → owned, 'Borrowed' → borrowed, both in hand), and
 * `format` gives which format that copy is. Computed here from the raw data rather than imported
 * from the app, so a regression in the app's mapping cannot quietly move the expectation with it.
 */
function expectedShelves(): { physical: number; ebook: number; audiobook: number } {
  const seed = JSON.parse(
    readFileSync(new URL('../../../data/personal_seed.json', import.meta.url), 'utf8'),
  ) as { books?: unknown[] } | unknown[]
  const books = (Array.isArray(seed) ? seed : (seed.books ?? [])) as {
    source?: string
    format?: string
  }[]
  const out = { physical: 0, ebook: 0, audiobook: 0 }
  for (const b of books) {
    // In hand = owned OR borrowed. A borrowed book carries a format too — that is the whole point
    // of the in-hand gate, and the bug the old seed had (it flagged formats for 'Owned' only).
    if (b.source !== 'Owned' && b.source !== 'Borrowed') continue
    const f = (b.format ?? '').toLowerCase()
    if (/ebook|kindle/.test(f)) out.ebook++
    else if (/audio/.test(f)) out.audiobook++
    else out.physical++
  }
  return out
}

async function signIn(page: Page): Promise<void> {
  const sb = createClient(SUPABASE_URL, ANON)
  const { data, error } = await sb.auth.signInWithPassword({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
  })
  if (error || !data.session) throw new Error(authFailure('shelf-membership', DEV_EMAIL, error))
  await page.addInitScript(() => localStorage.setItem('reverie.onboarded', '1'))
  await page.goto(
    `/#access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`,
  )
  await page.getByRole('button', { name: /enter your library/i }).click({ timeout: 20_000 })
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => indexedDB.deleteDatabase('reverie-offline'))
}

async function stub(page: Page): Promise<void> {
  for (const p of ['search', 'enrich', 'embed', 'releases', 'series', 'covers'])
    await page.route(`**/functions/v1/${p}**`, (r) => r.fulfill({ json: {} }))
  await page.route('**/books/v1/volumes**', (r) => r.fulfill({ json: { items: [] } }))
}

/** The "Your copies" block: the three smart shelves derived from per-format possession. */
const copiesSection = (page: Page) =>
  page.getByRole('heading', { name: 'Your copies' }).locator('xpath=..')

/** One shelf's row — the label div whose text is e.g. "📖 Physical · 190". */
const shelfRow = (page: Page, label: string) =>
  copiesSection(page).getByText(new RegExp(`${label}\\s*·\\s*\\d+`))

test('the Owned·format shelves hold what the seeded library actually puts in them', async ({
  page,
}) => {
  const want = expectedShelves()
  // Guard the guard: a seed that produced nothing would make every assertion below vacuously true.
  expect(
    Math.min(want.physical, want.ebook, want.audiobook),
    'the seed must carry books in all three formats or this test proves nothing',
  ).toBeGreaterThan(0)

  seedOwnLibrary()
  await stub(page)
  await signIn(page)
  await page.goto('/shelves')

  for (const [label, n] of [
    ['Physical', want.physical],
    ['Ebook', want.ebook],
    ['Audiobook', want.audiobook],
  ] as const) {
    // The count the reader reads…
    await expect(shelfRow(page, label), `${label} shelf readout`).toHaveText(
      new RegExp(`·\\s*${n}$`),
      { timeout: 20_000 },
    )
    // …and the spines actually on the shelf, so a correct-looking number over an empty shelf fails.
    await expect(
      shelfRow(page, label).locator('xpath=..').locator('[data-spine]'),
      `${label} shelf spines`,
    ).toHaveCount(n)
  }
})

test('a borrowed book carries its format onto a shelf — in hand is not the same as owned', async ({
  page,
}) => {
  // The seed's 77 borrowed books are 65 ebook + 12 audiobook. If the in-hand gate ever narrows back
  // to strict ownership, the ebook shelf loses 65 of its 68 and this fails loudly, where the
  // aggregate assertion above would only shift a number.
  seedOwnLibrary()
  await stub(page)
  await signIn(page)

  const sb = createClient(SUPABASE_URL, ANON)
  const { data } = await sb.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD })
  const uid = data.session!.user.id
  const { count } = await sb
    .from('books')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', uid)
    .eq('borrowed', true)
    .eq('owned_ebook', true)
  expect(count ?? 0, 'seeded borrowed ebooks').toBeGreaterThan(0)

  await page.goto('/shelves')
  await expect(shelfRow(page, 'Ebook')).toBeVisible({ timeout: 20_000 })
  const shown = Number(
    /·\s*(\d+)/.exec((await shelfRow(page, 'Ebook').textContent()) ?? '')?.[1] ?? '0',
  )
  expect(shown, 'the Ebook shelf must include the borrowed ebooks').toBeGreaterThanOrEqual(
    count ?? 0,
  )
})

test('an abandoned book you never owned is still in the library', async ({ page }) => {
  // The DNF hole. It cannot be shown with seeded data — every seeded book is owned or borrowed, so
  // all 290 reach the library through possession and the read-status leg of the predicate is never
  // exercised. This book is the only one in the fixture set that is NOT in hand: unowned, not
  // borrowed, not wanted, never finished. Before hasReadingHistory() it was invisible.
  seedOwnLibrary()
  const sb = createClient(SUPABASE_URL, ANON)
  const { data, error } = await sb.auth.signInWithPassword({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
  })
  if (error || !data.session) throw new Error(authFailure('shelf-membership dnf', DEV_EMAIL, error))
  const uid = data.session.user.id

  const title = 'Abandoned And Unowned'
  await sb.from('books').delete().eq('owner_id', uid).eq('title', title)
  const { error: insertError } = await sb.from('books').insert({
    owner_id: uid,
    title,
    author_first: 'Nell',
    author_last: 'Marrow',
    genre: 'fantasy',
    status: 'standalone',
    ownership: 'unowned',
    borrowed: false,
    wishlist: false,
    read_status: 'DNF',
  })
  expect(insertError, 'DNF fixture insert').toBeNull()

  await stub(page)
  await signIn(page)
  await page.goto('/library')

  // Visible in the DEFAULT scope — no wishlist chip, no filter. (That it is visible WITHOUT being
  // counted as Read is asserted in filters.test.ts, where both predicates are in reach.)
  await expect(page.getByRole('button', { name: `Open ${title}` })).toBeVisible({ timeout: 20_000 })

  await sb.from('books').delete().eq('owner_id', uid).eq('title', title)
})
