import { expect, test, type Page } from './support/fixtures'
import { createClient } from '@supabase/supabase-js'
import { authFailure } from './support/authError'
import { keepOfflineCacheEmpty } from './support/offlineCache'
import { ok, okUser } from './support/ok'

// Library search must SAY when it withheld a match.
//
// The defect this guards is not the filtering. matchesFilters applies the inDefaultLibrary scope
// gate before the text filter, deliberately, and that stays. The defect was the silence: type a
// wishlist-only book's exact full title and the grid comes back empty with nothing on screen
// admitting a match was held back. The only escape is the ⊹ Show wishlist chip, whose label never
// suggests it governs search results.
//
// Runs in the MAIN e2e job because what needs a browser is that the line actually RENDERS with the
// right number and that "show" reveals the book — the count itself is proven as a pure function in
// packages/core (hiddenMatchCount), which is where the arithmetic claim belongs.
//
// Located by data-testid throughout. The notice's own text carries the count and the reveal
// control's label is the thing under test, so locating by either would be keyed to exactly what a
// mutation would change — a guard that reports "fine" against the broken build.

const SUPABASE_URL = 'http://127.0.0.1:55321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const EMAIL = 'search-withheld-e2e@reverie.local'
const PASSWORD = 'search-withheld-e2e-password'

// The seeded repro from the usability assessment: unowned, not borrowed, wishlist, no reads. Out of
// the default library on every count, so an exact-title query on it is the silent case.
const WISHED_TITLE = 'Withheld Probe'
// In the default library. Its exact title is the control query that must hide nothing.
const PRESENT_TITLE = 'Present Probe'

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
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  let uid = data?.users?.find((u) => u.email === EMAIL)?.id
  if (!uid) {
    uid = (
      await okUser(
        admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true }),
        'search-withheld createUser',
      )
    ).id
  }
  await ok(
    admin
      .from('profiles')
      .upsert({ id: uid, display_name: 'Search Withheld E2E', skin: 'tryst', mode: 'dark' }),
    'search-withheld profiles upsert',
  )
  const sb = createClient(SUPABASE_URL, ANON)
  const { data: s, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error || !s.session) throw new Error(authFailure('search-withheld', EMAIL, error))
  shared = { sb, session: s.session, uid: s.session.user.id }
  return shared
}

/** Exactly two books: one the scope gate withholds, one it admits. */
async function seedFixtures(c: Client): Promise<void> {
  const { data: existing } = await c.sb.from('books').select('id').eq('owner_id', c.uid)
  const ids = ((existing as { id: string }[]) ?? []).map((b) => b.id)
  if (ids.length) {
    await ok(
      c.sb.from('list_items').delete().in('book_id', ids),
      'search-withheld list_items delete',
    )
    await ok(c.sb.from('books').delete().in('id', ids), 'search-withheld books delete')
  }
  await ok(c.sb.from('lists').delete().eq('owner_id', c.uid), 'search-withheld lists delete')

  // Every row carries EVERY possession column, defaults included. PostgREST sends one INSERT whose
  // column list is the UNION of all rows' keys, so a key one row omits arrives as an explicit NULL
  // rather than the column default — and the NOT NULL then rejects the whole batch, naming the
  // constraint rather than the omission.
  const base = {
    owner_id: c.uid,
    author_first: 'Nell',
    author_last: 'Marrow',
    genre: 'fantasy',
    status: 'standalone',
    ownership: 'owned',
    borrowed: false,
    wishlist: false,
    read_status: 'unset',
  }
  const { error: insertError } = await c.sb.from('books').insert([
    {
      ...base,
      title: WISHED_TITLE,
      ownership: 'unowned',
      borrowed: false,
      wishlist: true,
      read_status: 'unset',
    },
    {
      ...base,
      title: PRESENT_TITLE,
      ownership: 'owned',
      borrowed: false,
      wishlist: false,
      read_status: 'unset',
    },
  ])
  // Never swallowed: a failed insert would read as an empty grid, which is indistinguishable from
  // the very defect under test and would send the next reader hunting in the wrong file.
  if (insertError) throw new Error(`search-withheld seed failed: ${JSON.stringify(insertError)}`)
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
}

const notice = (page: Page) => page.getByTestId('search-hidden-notice')
const reveal = (page: Page) => page.getByTestId('search-hidden-reveal')
const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Search your library' })
const cardFor = (page: Page, title: string) => page.getByRole('button', { name: `Open ${title}` })

/** Type a query, then blur the box.
 *
 *  The blur is not decoration. While the search input holds focus, Toolbar's deployed
 *  SearchResultsPanel is an absolutely-positioned overlay hanging 6px below the input — directly
 *  over where the withheld line renders. toBeVisible() does not consider occlusion, so it would
 *  pass and the click on "show" would then fail on intercepted pointer events, reading as a broken
 *  control rather than a covered one.
 *
 *  blur(), NOT the Escape the panel advertises as its dismissal: Chromium's native handling of
 *  `<input type="search">` CLEARS the field on Escape, before the app's own onKeyDown blur runs.
 *  That fires a change to `q: ''`, the count legitimately drops to 0, and the line correctly does
 *  not render — a green-looking absence caused entirely by the harness. Cost an hour of looking at
 *  the component; recorded here so it costs nobody else one. */
async function search(page: Page, q: string) {
  await searchBox(page).fill(q)
  await searchBox(page).blur()
}

async function openLibrary(page: Page) {
  const c = await client()
  await seedFixtures(c)
  await stub(page)
  await signIn(page, c.session)
  await page.goto('/library')
  // Anchor on the in-scope book before anything else, so a slow query can never make a missing
  // line look like a passing test.
  await expect(cardFor(page, PRESENT_TITLE)).toBeVisible({ timeout: 20_000 })
}

test('an exact-title query on a withheld book says so, with a real count, and reveals it', async ({
  page,
}) => {
  await openLibrary(page)

  // The repro. Before this branch: an empty grid and silence.
  await search(page, WISHED_TITLE)

  // The line first — it is also the anchor that proves the filtered render has settled, so the
  // absence asserted on the next line cannot be "the grid had not updated yet".
  //
  // useInnerText, not textContent: the count is what a reader reads off the screen, and a skin is
  // free to set a text-transform that never touches the DOM node's text.
  await expect(notice(page)).toBeVisible()
  await expect(notice(page)).toHaveText(/^1 match hidden by filters\s*—\s*show$/, {
    useInnerText: true,
  })
  await expect(cardFor(page, WISHED_TITLE)).toHaveCount(0)

  // "— show" reveals them.
  await reveal(page).click()
  await expect(cardFor(page, WISHED_TITLE)).toBeVisible()

  // …and the line retires itself once there is nothing left withheld. It never becomes "0 hidden".
  await expect(notice(page)).toHaveCount(0)
})

test('the reveal drives the ⊹ Show wishlist chip itself, not a second switch beside it', async ({
  page,
}) => {
  // Beyond the literal ask, and the reason it is here: parallel state is the failure mode this
  // design was chosen to avoid. If "show" set its own flag, the chip would still read as off while
  // wishlist books were on screen, and toggling the chip would then fight the line.
  await openLibrary(page)
  await search(page, WISHED_TITLE)
  await expect(notice(page)).toBeVisible()

  // Viewport-agnostic: at ≥lg the filter panel is the docked left column and its toggle is
  // lg:hidden; at 390 (layout-sweep-390 sweeps this file by default) the toggle is the only way in.
  const toggle = page.getByRole('button', { name: /^Filters/ })
  if (await toggle.isVisible()) await toggle.click()

  const chip = page.getByRole('button', { name: '⊹ Show wishlist' })
  await expect(chip).toHaveAttribute('aria-pressed', 'false')

  await reveal(page).click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
})

test('a query that hides nothing shows no line at all', async ({ page }) => {
  await openLibrary(page)

  // The absence is asserted only AFTER the line has been seen to render in this very page — so a
  // component that silently failed to mount, or a testid that never resolves, cannot pass as
  // "nothing was hidden". This is the whole reason the withheld query runs first here.
  await search(page, WISHED_TITLE)
  await expect(notice(page)).toBeVisible()

  await search(page, PRESENT_TITLE)
  await expect(cardFor(page, PRESENT_TITLE)).toBeVisible()
  await expect(notice(page)).toHaveCount(0)

  // And the resting grid, with no query at all, is not annotated either.
  await search(page, '')
  await expect(cardFor(page, PRESENT_TITLE)).toBeVisible()
  await expect(notice(page)).toHaveCount(0)
})
