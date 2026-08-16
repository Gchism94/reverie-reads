import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from './support/fixtures'
import AxeBuilder from '@axe-core/playwright'
import { SKIN_ORDER, type SkinId } from '@reverie/core'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { authFailure } from './support/authError'
import { keepOfflineCacheEmpty } from './support/offlineCache'
import { ok, okData, okUser } from './support/ok'

const SUPABASE_URL = 'http://127.0.0.1:55321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
// A dedicated user, not the shared dev account. This spec is the ONLY one that mutates a profile's
// skin and mode — ten times per run — which is exactly what fonts and cover-sheet used to race.
const DEV_EMAIL = 'a11y-e2e@reverie.local'
const DEV_PASSWORD = 'a11y-e2e-password'
// The skin list is DERIVED from SKIN_ORDER (imported from @reverie/core) at the sweep plan below —
// deliberately no local skin array. The old `const SKINS = ['tryst','grimoire','aphelion','marrow']`
// was a fossil: written when those were all the skins there were, never revisited when the registry
// grew to nine, so five shipped skins were never once axe-scanned. A second copy of the list is
// exactly the drift mechanism that produced that gap.
const MODES = ['dark', 'light'] as const

/**
 * Give this spec's own user a full library, via the ONE seeding implementation the repo already
 * has. `scripts/seed-dev.mjs` honours DEV_EMAIL/DEV_PASSWORD and creates the account when absent,
 * so this needs no duplicated seed logic and no separate CI step — invoking it from the spec keeps
 * local and CI identical.
 *
 * The sweep genuinely needs the books: the seed is what populates the Library grid (all 290 land in
 * the default library — 213 owned and 77 borrowed since the seed started writing possession) and
 * Home's book-derived surfaces. Every other fixture below this spec creates itself. Measured cost of
 * a fresh user + 290 books: ~0.6s, against a ~15m job.
 *
 * Idempotent — re-running replaces this user's books, so repeat local runs are safe.
 */
function seedOwnLibrary(): void {
  const root = fileURLToPath(new URL('../../..', import.meta.url))
  execFileSync('node', ['scripts/seed-dev.mjs'], {
    cwd: root,
    env: { ...process.env, DEV_EMAIL, DEV_PASSWORD },
    stdio: 'pipe',
  })
}

/**
 * A signed-in anon client, or a diagnosis. The three fixture helpers below used to call
 * `signInWithPassword` and discard the result, then dereference `.data.user!.id` — so a failed
 * sign-in surfaced as a bare `TypeError` on the `.id` access, pointing at the wrong thing entirely.
 * Route them through the same `authFailure()` reader every other spec uses.
 */
async function signedInClient(context: string): Promise<SupabaseClient> {
  const sb = createClient(SUPABASE_URL, ANON)
  const { data, error } = await sb.auth.signInWithPassword({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
  })
  if (error || !data.session) throw new Error(authFailure(context, DEV_EMAIL, error))
  return sb
}

/** Establish a session directly: sign in with this spec's own password via the JS client, then hand
 *  the tokens to the app through the URL hash. The app's supabase client has detectSessionInUrl:true,
 *  so it adopts them on load and persists the session — the same landing the magic-link verify would
 *  produce, minus the email. This avoids Mailpit, the auth redirect allow-list, and the email rate
 *  limits, so it's immune to the dev server's port. TanStack Router is path-based, leaving the hash
 *  free for supabase-js to consume. */
async function signIn(page: Page) {
  const sb = createClient(SUPABASE_URL, ANON)
  const { data, error } = await sb.auth.signInWithPassword({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
  })
  if (error || !data.session) throw new Error(authFailure('a11y', DEV_EMAIL, error))
  const { access_token, refresh_token } = data.session
  await keepOfflineCacheEmpty(page)
  await page.goto(
    `/#access_token=${access_token}&refresh_token=${refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`,
  )
  // An auth-callback arrival lands on /welcome ("You're in"); the button confirms the session is set.
  await page.getByRole('button', { name: /enter your library/i }).click({ timeout: 20_000 })
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 20_000 })
}

async function setupFixtures(): Promise<{
  bookId: string
  clubId: string
  listCode: string
  shelfId: string
  tropeId: string
}> {
  const sb = await signedInClient('a11y setupFixtures')
  const uid = (await okUser(sb.auth.getUser(), 'a11y getUser')).id
  const bookId = (
    await okData(
      sb.from('books').select('id').order('added_at').limit(1).single(),
      'a11y books read',
    )
  ).id

  // Clear any fixtures a PREVIOUS run left behind, before creating this run's.
  //
  // Cleanup lives in the test's `finally`, but setup runs before that block exists — so an
  // interrupted or failed run (Ctrl-C, a CI timeout, a throw in here) leaks whatever it had already
  // created. `series` is UNIQUE (owner_id, name), which turned that leak into a ratchet: one
  // orphaned 'A11y Saga' row made the insert below return null, `.data!.id` threw, setup died
  // BEFORE the try block, and the club and shelf it had just made leaked too — wedging the suite
  // deterministically until someone deleted a row by hand. Clubs and lists have no unique
  // constraint, so they simply accumulated (4 of each, when this was found).
  await clearFixtures(sb)

  const club = await okData(
    sb
      .from('clubs')
      .insert({
        title: 'A11y Read-along',
        unit_type: 'chapter',
        unit_count: 10,
        unit_label: 'Chapter',
        created_by: uid,
      })
      .select()
      .single(),
    'a11y clubs insert',
  )
  await ok(
    sb
      .from('club_members')
      .insert({ club_id: club.id, user_id: uid, display_name: 'Dev', progress: 3 }),
    'a11y club_members insert',
  )

  // a shelf with one book, for the /shelf/$listId detail page
  const shelf = await okData(
    sb
      .from('lists')
      .insert({ owner_id: uid, name: 'A11y Shelf', kind: 'tbr', sort_order: 999999 })
      .select()
      .single(),
    'a11y lists insert',
  )
  await ok(
    sb
      .from('list_items')
      .insert({ list_id: shelf.id, book_id: bookId, owner_id: uid, position: 1000 }),
    'a11y list_items insert',
  )

  // a series with a linked entry + a ghost slot, for the /series/$seriesName page
  const series = await okData(
    sb
      .from('series')
      .insert({ owner_id: uid, name: 'A11y Saga', status: 'ongoing' })
      .select()
      .single(),
    'a11y series insert',
  )
  await ok(
    sb.from('series_entries').insert([
      {
        series_id: series.id,
        owner_id: uid,
        position: 1,
        title: 'Linked One',
        // Both rows carry every NOT NULL column explicitly, even where it's just the default.
        // PostgREST unions the two rows' keys for a bulk insert, so a column one row omits arrives
        // as NULL for it rather than falling back to the column default — and a NOT NULL column
        // then rejects the WHOLE batch. This bit twice (author, then user_edited) before both rows
        // carried the same key set. See AGENTS.md's testing discipline section.
        author: '',
        book_id: bookId,
        user_edited: true,
      },
      {
        series_id: series.id,
        owner_id: uid,
        position: 2.5,
        label: 'novella',
        title: 'A11y Ghost Novella',
        author: 'Ghost Writer',
        user_edited: true,
      },
    ]),
    'a11y series_entries insert',
  )

  // a trope assignment for the /tropes pages (canonical seed row + the fixture book)
  const trope = await okData(
    sb.from('tropes').select('id').is('owner_id', null).eq('name', 'Enemies to Lovers').single(),
    'a11y tropes lookup (the canonical seed row)',
  )
  await ok(
    sb
      .from('book_tropes')
      .upsert(
        { book_id: bookId, trope_id: trope.id, owner_id: uid, emphasis: 'pinned' },
        { onConflict: 'book_id,trope_id' },
      ),
    'a11y book_tropes upsert',
  )

  const listCode = 'A11YSMOKE'
  await ok(
    sb.from('shared_docs').upsert({
      key: listCode,
      value: { type: 'list', kind: 'list', name: 'A11y list', items: [], updatedAt: Date.now() },
    }),
    'a11y shared_docs upsert',
  )
  await ok(
    sb
      .from('shared_refs')
      .upsert(
        { owner_id: uid, code: listCode, kind: 'list', name: 'A11y list' },
        { onConflict: 'owner_id,code' },
      ),
    'a11y shared_refs upsert',
  )

  return { bookId, clubId: club.id, listCode, shelfId: shelf.id, tropeId: trope.id }
}

/** Remove every fixture row this spec creates, by its stable name — safe to run before or after. */
async function clearFixtures(sb: SupabaseClient) {
  await ok(sb.from('series').delete().eq('name', 'A11y Saga'), 'a11y series delete')
  await ok(sb.from('clubs').delete().eq('title', 'A11y Read-along'), 'a11y clubs delete')
  await ok(sb.from('lists').delete().eq('name', 'A11y Shelf'), 'a11y lists delete')
}

async function cleanup(clubId: string, listCode: string, shelfId: string, bookId?: string) {
  const sb = await signedInClient('a11y cleanup')
  await ok(sb.from('clubs').delete().eq('id', clubId), 'a11y clubs delete')
  await ok(sb.from('lists').delete().eq('id', shelfId), 'a11y lists delete')
  if (bookId) await sb.from('book_tropes').delete().eq('book_id', bookId)
  await ok(sb.from('series').delete().eq('name', 'A11y Saga'), 'a11y series delete')
  // shared_docs is NEVER deleted, on purpose: 20260624010400_grants.sql grants only
  // select/insert/update to authenticated (no delete), sharedLists.ts matches — the app itself
  // never deletes a shared_docs row — and ownedTables.ts documents that capability share docs
  // persist by design ("re-joining means entering the code again"). Attempting the delete here
  // always failed (permission denied), invisible until the bare await was routed through ok().
  // Nothing to clean up: setupFixtures upserts this row on the stable key 'A11YSMOKE', so each
  // run overwrites it rather than accumulating a new one.
  await ok(sb.from('shared_refs').delete().eq('code', listCode), 'a11y shared_refs delete')
  await setProfileSkinMode('tryst', 'system') // restore the dev profile
}

/** Set the dev profile's skin + mode so the app's skin-sync applies them on the next load
 * (avoids racing the client-side sync — this also exercises the real persistence path). */
async function setProfileSkinMode(skin: string, mode: string) {
  const sb = await signedInClient('a11y setProfileSkinMode')
  const uid = (await okUser(sb.auth.getUser(), 'a11y getUser')).id
  await ok(sb.from('profiles').update({ skin, mode }).eq('id', uid), 'a11y profiles update')
}

/**
 * Guard against the exact regression class the pre-seed above exists to remove: `data-skin` /
 * `data-mode` land synchronously with the attribute write, but a `.skin-control`'s own rendered
 * `color` (`color: var(--ink)`, `transition: all var(--motion-duration)`) can still be mid-flight
 * toward that value — `data-mode` alone was already correct at the exact instant CI read an
 * unsettled color, so it cannot catch this. This checks the RENDERED color a control is actually
 * painting, not the attribute.
 *
 * The expected value is never hardcoded: a detached element stamped fresh with the target
 * `data-skin`/`data-mode` has no prior state to transition FROM, so its first computed `--ink` is
 * the token's cascade resolution, straight from tokens.css, with nothing here to go stale against
 * it. If a silently-broken pre-seed reintroduces the boot-light-then-flip sequence, this fails
 * loudly instead of the suite passing on a `data-mode` read that was never wrong to begin with.
 */
async function assertInkSettled(page: Page, skin: string, mode: string, where: string) {
  const result = await page.evaluate(
    ({ skin, mode }) => {
      const probe = document.createElement('div')
      probe.dataset.skin = skin
      probe.dataset.mode = mode
      probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none'
      document.body.appendChild(probe)
      const expectedInk = getComputedStyle(probe).getPropertyValue('--ink').trim()
      probe.remove()

      // .skin-btn-primary is EXCLUDED on purpose — its color is --cta-ink, a different token, and
      // matching it here produced a guaranteed false mismatch against the --ink expectation below.
      // Two DIFFERENT ways a control ends up --ink-colored: skin-kit's base rules set it directly
      // (.skin-btn-secondary / .skin-btn-icon); AppShell's nav chrome does it via Tailwind's
      // text-ink utility (--color-ink: var(--ink) in globals.css) on a bare .skin-control. Either
      // is present on every authenticated route via AppShell alone.
      const control = document.querySelector(
        '.skin-btn-secondary, .skin-btn-icon, .skin-control.text-ink',
      )
      const renderedColor = control ? getComputedStyle(control).color : null
      // Resolve the expected value through the SAME parse path (a live element's computed style)
      // so an rgb()-vs-hex string mismatch can't produce a false failure.
      const expectedProbe = document.createElement('div')
      expectedProbe.style.cssText = `position:absolute;visibility:hidden;color:${expectedInk}`
      document.body.appendChild(expectedProbe)
      const expectedColor = getComputedStyle(expectedProbe).color
      expectedProbe.remove()

      return { controlFound: !!control, renderedColor, expectedColor }
    },
    { skin, mode },
  )
  expect(result.controlFound, `${where}: no .skin-control present to check`).toBe(true)
  expect(
    result.renderedColor,
    `${where}: a .skin-control's rendered color has not settled to the ${skin}/${mode} ink token`,
  ).toBe(result.expectedColor)
}

// Title states the real scope on purpose — and the scope is now ALL NINE skins. Until 2026-08-10
// this swept four (tryst/grimoire/aphelion/marrow), which was never a chosen sample: the constant
// predated the nine-skin expansion, so umbra, folio, hearth, almanac and bloom shipped with their
// own token sets and structural bones and were never once scanned here. Division of labour,
// unchanged: the registry-keyed contrast tests in packages/core remain the exhaustive TOKEN-PAIR
// layer across all nine; what this spec adds per skin is the RENDERED page — emergent pairings,
// text over per-skin surfaces — plus, in tryst alone, the skin-invariant structural/ARIA rules,
// which compute identically in every skin and so are checked once, on every route, in both modes,
// rather than re-checked per skin.
test('axe (no serious/critical): every route in tryst x both modes; a core set in all 8 other skins x one deterministic mode', async ({
  page,
}) => {
  // 1080s (18m) — the SECOND raise, and this one is not about scan count.
  //
  // 600s -> 720s was earned: the 88 -> 104-scan reallocation added 18% more scans and 20% more
  // budget, leaving the effective headroom unchanged.
  //
  // 720s -> 1080s is different, and worth being honest about: nothing in this spec grew. The RUNNER
  // got slower. Measured on CI, same suite, ~16 hours apart:
  //   PR #255, 07:09Z  ->  8m36s, passed
  //   PR #258, 22:55Z  -> 12.9m, TIMED OUT at 720s
  //   PR #258, 23:10Z  -> 15.1m, TIMED OUT at 720s (a rerun, so not a one-off)
  // The failing branch does not touch this file at all (`git diff` on it is empty), so the change is
  // in the environment, not the test. Two runs over budget in a row is consistently over, not flaky
  // — re-running does not fix a ceiling that is simply too low.
  //
  // THIS IS A STOPGAP AND SHOULD BE READ AS ONE. The ceiling is a real tripwire — the workers=4
  // probe blew exactly this timeout — and it only keeps working while it stays close to normal
  // runtime. At 15m observed against 18m, the margin is already thin, and the next runner
  // regression eats it. Raising the number again is not the answer a third time: the durable fix is
  // splitting this sweep into per-skin jobs so one slow runner cannot spend the whole suite's budget
  // in a single test. Filed in docs/backlog/BACKLOG.md.
  test.setTimeout(1_080_000)
  seedOwnLibrary() // creates this spec's user on first run, and gives it the books the sweep needs
  const { bookId, clubId, listCode, shelfId, tropeId } = await setupFixtures()
  await signIn(page)

  // Discover browses an external catalog — stub it so the sweep is deterministic and offline-safe.
  // Covers point at the self-hosted landing thumbs, so the populated grid renders with zero
  // third-party requests; one hit matches the seeded library shape only by accident (never).
  const vol = (title: string, author: string, cover: string, isbn: string) => ({
    volumeInfo: {
      title,
      authors: [author],
      publishedDate: '2026-01-01',
      imageLinks: { thumbnail: cover },
      industryIdentifiers: [{ type: 'ISBN_13', identifier: isbn }],
    },
  })
  await page.route('**/books/v1/volumes**', (route) =>
    route.fulfill({
      json: {
        items: [
          vol('Fourth Wing', 'Rebecca Yarros', '/landing-covers/everflame.jpg', '9781649374042'),
          vol('Iron Flame', 'Rebecca Yarros', '/landing-covers/king-of-wrath.jpg', '9781649374172'),
          vol(
            'The Serpent and the Wings of Night',
            'Carissa Broadbent',
            '/landing-covers/never-king.jpg',
            '9781250343178',
          ),
          vol('Divine Rivals', 'Rebecca Ross', '/landing-covers/mile-high.jpg', '9781250857439'),
        ],
      },
    }),
  )

  // The embed fn (Tier 2) is a background enhancement — stub it so the sweep can't stall
  // networkidle waits, and the run needs no local functions server.
  await page.route('**/functions/v1/embed**', (route) =>
    route.fulfill({ json: { embedded: 0, remaining: 0, hits: [] } }),
  )
  await page.route('**/functions/v1/releases**', (route) =>
    route.fulfill({ json: { authors: {}, pending: [], hits: [] } }),
  )
  // Cover system: detail views lazily backfill external covers via the covers fn — stub it so the
  // sweep never depends on a local functions server (and never mutates the seeded covers).
  await page.route('**/functions/v1/covers**', (route) =>
    route.fulfill({ status: 422, json: { error: 'fetch_failed' } }),
  )

  // Tryst (the default skin) gets full route coverage; the alternate skins sweep a core set
  // that exercises the whole token surface (palette, cards, fills, links, muted text).
  const allRoutes: [string, string][] = [
    ['Home', '/'],
    ['Library', '/library'],
    ['Book detail', `/book/${bookId}`],
    ['Shelves', '/shelves'],
    ['Planner', '/planner'],
    ['Stats', '/stats'],
    ['Match', '/match'],
    ['Discover', '/discover'],
    ['Add', '/add'],
    ['Settings', '/settings'],
    ['Clubs', '/clubs'],
    ['Club', `/club/${clubId}`],
    ['SharedList', `/list/${listCode}`],
    ['Shelf detail', `/shelf/${shelfId}`],
    ['Indie', '/indie'],
    ['Skins', '/skins'],
    ['Series index', '/series'],
    ['Series detail', `/series/${encodeURIComponent('A11y Saga')}`],
    ['Tropes', '/tropes'],
    ['Trope detail', `/tropes/${tropeId}`],
  ]
  const coreRoutes = allRoutes.filter(([name]) =>
    ['Home', 'Library', 'Book detail', 'Stats', 'Settings', 'Skins', 'Clubs', 'Indie'].includes(
      name,
    ),
  )

  // ── The sweep plan: every skin in the registry, derived from SKIN_ORDER so this spec can never
  // hold a second, driftable copy of the skin list. Tryst — the default skin, whose full-route
  // pass carries all of the skin-invariant structural/ARIA coverage — keeps both modes across
  // every route. Every OTHER skin gets the core set in exactly ONE mode, assigned by its FIXED
  // position in SKIN_ORDER: even index → dark, odd index → light. Position is the only input, so
  // the same commit scans the same combinations on every run, forever — a rotation keyed to date
  // or run count would let a contrast defect appear and disappear across re-runs of an identical
  // tree, which is precisely the non-reproducibility this convention exists to rule out. The
  // parity split lands 4 dark + 4 light across the eight, so both modes stay exercised beyond
  // tryst. (Literal indices into MODES, not MODES[i % 2]: noUncheckedIndexedAccess types a
  // computed index as possibly-undefined.)
  type SweepPass = { skin: SkinId; mode: (typeof MODES)[number]; routes: [string, string][] }
  const sweep = SKIN_ORDER.flatMap((skin, i): SweepPass[] =>
    skin === 'tryst'
      ? MODES.map((mode) => ({ skin, mode, routes: allRoutes }))
      : [{ skin, mode: i % 2 === 0 ? MODES[0] : MODES[1], routes: coreRoutes }],
  )
  // One line in the CI log naming every combination this run will scan — the fossil four-skin era
  // was invisible precisely because nothing ever said out loud what was (not) being swept.
  console.log('a11y sweep plan: ' + sweep.map((s) => `${s.skin}/${s.mode}`).join(', '))

  const failures: string[] = []
  const visited = new Set<SkinId>()
  try {
    for (const { skin, mode, routes } of sweep) {
      await setProfileSkinMode(skin, mode) // skin-sync picks this up on each fresh load
      // Pre-seed the target BEFORE the next navigation reloads index.html's boot script, so it
      // stamps data-skin/data-mode correctly on FIRST PAINT instead of booting 'system' — which
      // resolves to Playwright's default light colorScheme — and letting useSkinSync flip it only
      // after the profile query lands. That flip left .skin-control's transition (all
      // var(--motion-duration), ~0.18s) still interpolating a control's rendered color when axe
      // scanned, which is what actually produced the CI-only violation this guards against — a
      // WCAG-real read of an unsettled paint, not a real defect (instrumented and confirmed via a
      // throwaway diagnosis spec on fix/a11y-contrast-diagnosis, reported and closed unmerged).
      // page.goto() below is a full browser navigation (confirmed by the boot
      // script re-running), and localStorage is origin-scoped, so this write — made on the page
      // this function is ALREADY on, from signIn()'s own navigation — survives it. This removes
      // the race; it does not wait it out.
      await page.evaluate(
        ({ skin, mode }) => {
          localStorage.setItem('reverie.skin', skin)
          localStorage.setItem('reverie.mode', mode)
        },
        { skin, mode },
      )
      // Each goto below is a full navigation, so keepOfflineCacheEmpty's init script re-runs and
      // this skin/mode is read fresh rather than restored from the previous pass's snapshot.
      for (const [name, path] of routes) {
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        await page.locator('main').waitFor({ state: 'visible' })
        await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
        await expect(page.locator('html')).toHaveAttribute('data-mode', mode)
        await assertInkSettled(page, skin, mode, `${skin}/${mode} ${name}`)

        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
        const serious = results.violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical',
        )
        for (const v of serious) {
          const detail = v.nodes
            .slice(0, 2)
            .map((n) => {
              const d = n.any?.[0]?.data as
                | { fgColor?: string; bgColor?: string; contrastRatio?: number }
                | undefined
              return d?.contrastRatio != null
                ? `${String(n.target)} fg=${d.fgColor} bg=${d.bgColor} ratio=${d.contrastRatio}`
                : String(n.target)
            })
            .join(' || ')
          failures.push(
            `[${skin}/${mode}] ${name} (${path}): ${v.id} (${v.nodes.length}) — ${detail}`,
          )
        }
      }
      visited.add(skin)
    }
  } finally {
    await cleanup(clubId, listCode, shelfId, bookId)
  }

  // The coverage claim, ASSERTED rather than trusted: every skin in the registry was genuinely
  // reached (added to `visited` only after its full route pass completed). Registry-keyed like the
  // core contrast tests — a tenth skin added to SKIN_ORDER fails HERE until the sweep covers it,
  // instead of silently joining the five skins the four-skin era never scanned.
  expect([...visited].sort(), 'every skin in SKIN_ORDER must be swept').toEqual(
    [...SKIN_ORDER].sort(),
  )

  if (failures.length) console.log('axe serious/critical violations:\n' + failures.join('\n'))
  expect(failures, failures.join('\n')).toHaveLength(0)
})

// The unauthenticated front door (gold master brand) — no sign-in seed needed, so it's a simpler,
// faster pass. The gold CTA's dark text and the brand's muted/faint copy must clear AA here too.
test('unauthenticated landing + auth pass axe', async ({ page }) => {
  const routes: [string, string][] = [
    ['Landing', '/'],
    ['Auth · sign in', '/auth?mode=signin'],
    ['Auth · sign up', '/auth?mode=signup'],
    // The email-link landing (/welcome): the expired-link view and the set-new-password form
    // both render without a session, driven purely by the callback hash.
    [
      'Welcome · expired link',
      '/welcome#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    ],
    ['Welcome · set new password', '/welcome#type=recovery'],
  ]
  const failures: string[] = []
  for (const [name, path] of routes) {
    await page.goto(path)
    await page.locator('main').first().waitFor({ state: 'visible' })
    await page.waitForLoadState('networkidle') // let the landing's lazy below-fold chunk render before scanning
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    for (const v of results.violations.filter(
      (x) => x.impact === 'serious' || x.impact === 'critical',
    )) {
      const detail = v.nodes
        .slice(0, 2)
        .map((n) => {
          const d = n.any?.[0]?.data as
            | { fgColor?: string; bgColor?: string; contrastRatio?: number }
            | undefined
          return d?.contrastRatio != null
            ? `${String(n.target)} fg=${d.fgColor} bg=${d.bgColor} ratio=${d.contrastRatio}`
            : String(n.target)
        })
        .join(' || ')
      failures.push(`[${name}] (${path}): ${v.id} (${v.nodes.length}) — ${detail}`)
    }
  }
  if (failures.length) console.log('axe (unauth) violations:\n' + failures.join('\n'))
  expect(failures, failures.join('\n')).toHaveLength(0)
})
