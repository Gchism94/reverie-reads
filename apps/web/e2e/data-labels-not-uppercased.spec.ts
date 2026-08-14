import { expect, test, type Page } from './support/fixtures'
import { createClient } from '@supabase/supabase-js'
import { authFailure } from './support/authError'
import { keepOfflineCacheEmpty } from './support/offlineCache'
import { ok, okUser } from './support/ok'

// A control whose LABEL IS DATA must render that data unchanged, in every skin.
//
// ── THE DEFECT THIS GUARDS ──────────────────────────────────────────────────────────────────────
// `.skin-control` sets `text-transform: var(--control-transform)`, which is `uppercase` in aphelion,
// umbra and almanac. `text-transform` is INHERITED, so it reaches descendants too. The control-radius
// migration routed 13 call sites onto it whose labels are reader data — book titles, series names,
// author names, the reader's own tags and tropes, and text typed into a search box a moment earlier.
// They rendered as A COURT OF THORNS AND ROSES: the app editorializing content it did not write.
// `.skin-control-quiet` (skin-kit.css) is the fix; this spec is what stops it coming back.
//
// ── WHY THIS IS AN E2E TEST AND NOT A UNIT TEST ─────────────────────────────────────────────────
// jsdom does not apply the skin stylesheet, and its `innerText` is not transform-aware, so the
// assertion below is meaningless outside a real browser with the real CSS.
//
// ── WHY `innerText` AND NOT `textContent` — READ THIS BEFORE EDITING ────────────────────────────
// `text-transform` is a purely VISUAL property. It changes the rendered glyphs and does not touch
// the DOM text. Measured against the built CSS in aphelion, on one element:
//
//     textContent  ->  'A Court of Thorns and Roses'      (unchanged — the transform is invisible)
//     innerText    ->  'A COURT OF THORNS AND ROSES'      (transform applied)
//
// So the obvious spelling of this test:
//
//     expect(await el.textContent()).toBe(TITLE)          // <-- PASSES ON THE BROKEN BUILD
//
// passes against the broken build and the fixed one alike. It is a proxy guard: it asserts something
// adjacent to the defect (the DOM holds the right string — it always did) while the defect itself
// (the reader SEES the wrong string) is invisible to it. That mutant is not runnable here because it
// cannot fail, which is precisely the point — it is recorded so the next person reaching for
// `textContent` recognises the trap before shipping a green test that proves nothing.
//
// Playwright's `toHaveText` and `innerText()` both resolve the transform. Use them.
//
// This is one of a family: `content`, `::before`/`::after`, `visibility`, `order`, `direction` and
// `text-transform` all change what a person perceives while leaving the DOM identical. Any assertion
// about what a reader SEES has to read rendered output, never the node.

const SUPABASE_URL = 'http://127.0.0.1:55321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const EMAIL = 'data-labels-e2e@reverie.local'
const PASSWORD = 'data-labels-e2e-password'

/** An uppercase-transform skin. Verified in tokens.css: aphelion, umbra and almanac set
 *  `--control-transform: uppercase`; the other six set `none`, where this defect cannot appear. */
const SKIN = 'aphelion'

// Deliberately mixed-case, and deliberately multi-word: a single lowercase word would still "look
// right" under `capitalize`, and only mixed case distinguishes `uppercase` from every other value.
const TITLE = 'A Court of Thorns and Roses'
const AUTHOR_FIRST = 'Sarah'
const AUTHOR_LAST = 'Maas'
const GENRE = 'fantasy'
const TAG = 'Enemies to Lovers'

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
        'data-labels createUser',
      )
    ).id
  }
  await ok(
    admin
      .from('profiles')
      .upsert({ id: uid, display_name: 'Data Labels E2E', skin: SKIN, mode: 'dark' }),
    'data-labels profiles upsert',
  )
  const sb = createClient(SUPABASE_URL, ANON)
  const { data: s, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error || !s.session) throw new Error(authFailure('data-labels', EMAIL, error))
  shared = { sb, session: s.session, uid: s.session.user.id }
  return shared
}

async function seed(c: Client): Promise<void> {
  const { data: existing } = await c.sb.from('books').select('id').eq('owner_id', c.uid)
  const ids = ((existing as { id: string }[]) ?? []).map((b) => b.id)
  if (ids.length) await ok(c.sb.from('books').delete().in('id', ids), 'data-labels books delete')

  // Every row carries every column the batch uses — PostgREST takes the UNION of all rows' keys as
  // the column set, so an omitted key is sent as an explicit NULL rather than the column default.
  const { error } = await c.sb.from('books').insert([
    {
      owner_id: c.uid,
      title: TITLE,
      author_first: AUTHOR_FIRST,
      author_last: AUTHOR_LAST,
      genre: GENRE,
      status: 'standalone',
      ownership: 'owned',
      borrowed: false,
      wishlist: false,
      read_status: 'Read',
      tags: [TAG],
    },
  ])
  if (error) throw new Error(`data-labels seed failed: ${JSON.stringify(error)}`)
}

async function signIn(page: Page, session: { access_token: string; refresh_token: string }) {
  await keepOfflineCacheEmpty(page)
  await page.addInitScript(() => localStorage.setItem('reverie.onboarded', '1'))
  await page.addInitScript(
    (skin) => {
      localStorage.setItem('reverie.skin', skin)
      localStorage.setItem('reverie.mode', 'dark')
    },
    [SKIN],
  )
  await page.goto(
    `/#access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`,
  )
  await page.getByRole('button', { name: /enter your library/i }).click({ timeout: 20_000 })
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 20_000 })
}

/**
 * The generic invariant, and the one that gives this spec its reach.
 *
 * For every element on the page whose DOM text is exactly one of the seeded data values, assert the
 * RENDERED text matches too. It is deliberately not keyed to a class or a testid: an element that
 * regresses from `.skin-control-quiet` back to `.skin-control` keeps its text and would slip past a
 * class-scoped selector, but cannot slip past this. Covers whatever the visited route renders.
 */
async function expectDataRenderedVerbatim(page: Page, values: string[], where: string) {
  const bad = await page.evaluate((vals) => {
    const out: { value: string; rendered: string; cls: string }[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const raw = el.textContent?.trim()
      if (!raw || !vals.includes(raw)) continue
      // ARTWORK IS NOT A LABEL. The generated cover placeholder draws the author's name in caps with
      // wide tracking, because that is what a book cover looks like — deliberate typography, and the
      // reason CoverPlaceholder.tsx already sits in the migration meter's ARTWORK_FILES list. This
      // guard found it on its first run, which is the guard working; excluding it is a triage, not a
      // fudge. The two exclusions are semantic rather than file-scoped, so they keep holding as the
      // artwork moves: a control LABEL is never `aria-hidden` (a reader must be able to read it) and
      // never sits inside `role="img"` (it would not be text to the accessibility tree at all).
      if (el.closest('[aria-hidden="true"], [role="img"]')) continue
      // innerText resolves text-transform; textContent does not. See the header.
      const rendered = el.innerText?.trim()
      if (rendered && rendered !== raw)
        out.push({ value: raw, rendered, cls: el.className?.toString().slice(0, 80) ?? '' })
    }
    return out
  }, values)

  expect(
    bad,
    `${where}: reader data was re-cased on screen in the "${SKIN}" skin. ` +
      bad.map((b) => `"${b.value}" rendered as "${b.rendered}" (class="${b.cls}")`).join('; '),
  ).toEqual([])
}

test.beforeAll(async () => {
  const c = await client()
  await seed(c)
})

test('the skin under test really does uppercase controls — otherwise this spec proves nothing', async ({
  page,
}) => {
  const c = await client()
  await signIn(page, c.session)
  await expect(page.locator('html')).toHaveAttribute('data-skin', SKIN)

  // A CONTROL-of-the-guard: if --control-transform ever stops being `uppercase` in this skin, every
  // assertion below would pass for the wrong reason — a green suite proving only that nothing
  // transforms anything. This fails loudly in that case instead.
  const transform = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.className = 'skin-control'
    probe.textContent = 'Probe'
    document.body.appendChild(probe)
    const t = getComputedStyle(probe).textTransform
    probe.remove()
    return t
  })
  expect(
    transform,
    `--control-transform is "${transform}" in ${SKIN}, not "uppercase". This spec's assertions ` +
      `would then pass vacuously — pick a skin that still uppercases, or delete this spec.`,
  ).toBe('uppercase')
})

test('a book title, author, genre and the reader’s own tag all render verbatim', async ({
  page,
}) => {
  const c = await client()
  await signIn(page, c.session)

  await page.goto('/library')
  await page.locator('main').waitFor({ state: 'visible' })
  await expect(page.getByText(TITLE).first()).toBeVisible({ timeout: 20_000 })

  // Explicit, per-site assertions on the elements this defect actually hit. `toHaveText` uses
  // innerText, so each of these sees the transform.
  await expect(page.getByText(TITLE).first()).toHaveText(TITLE)

  await expectDataRenderedVerbatim(page, [TITLE, TAG, `${AUTHOR_FIRST} ${AUTHOR_LAST}`], '/library')
})

test('filter chips render genre, subgenre and tag names verbatim (the Chip cluster)', async ({
  page,
}) => {
  const c = await client()
  await signIn(page, c.session)

  await page.goto('/library')
  await page.locator('main').waitFor({ state: 'visible' })

  // FilterPanel is where Chip.tsx renders genres, subgenres and the reader's own tags — 3 of the 5
  // call sites that shared component covers.
  const filters = page.getByRole('button', { name: /^Filters/ })
  if (await filters.isVisible().catch(() => false)) {
    await filters.click()
    await expect(
      page.getByRole('button', { name: new RegExp(`^${TAG}$`, 'i') }).first(),
    ).toBeVisible({ timeout: 10_000 })
    await expect(
      page.getByRole('button', { name: new RegExp(`^${TAG}$`, 'i') }).first(),
    ).toHaveText(TAG)
    await expectDataRenderedVerbatim(page, [TAG, GENRE], '/library (filters open)')
  }
})

test('the book screen renders the title and its tropes verbatim', async ({ page }) => {
  const c = await client()
  await signIn(page, c.session)

  await page.goto('/library')
  await page.locator('main').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: new RegExp(`^Open ${TITLE}`) }).click({ timeout: 20_000 })
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 20_000 })

  // TropeChip lives here — one of the 8 direct sites.
  await expectDataRenderedVerbatim(page, [TITLE, TAG, `${AUTHOR_FIRST} ${AUTHOR_LAST}`], '/book')
})

test('no .skin-control-quiet element anywhere re-cases its own text', async ({ page }) => {
  const c = await client()
  await signIn(page, c.session)

  // The class-scoped counterpart to the value-scoped invariant above. This one cannot catch a
  // regression BACK to .skin-control (the element leaves the selector), which is exactly why the
  // value-scoped assertions exist alongside it — stated so the pair does not read as redundant.
  for (const route of ['/library', '/shelves', '/discover', '/planner']) {
    await page.goto(route)
    await page.locator('main').waitFor({ state: 'visible' })
    const offenders = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.skin-control-quiet'))
        .filter((el) => {
          const raw = el.textContent?.trim()
          return raw && el.innerText?.trim() !== raw
        })
        .map((el) => `${el.className}: "${el.textContent?.trim().slice(0, 40)}"`),
    )
    expect(offenders, `${route}: a .skin-control-quiet element re-cased its text`).toEqual([])
  }
})
