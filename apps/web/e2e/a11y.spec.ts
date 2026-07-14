import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'http://127.0.0.1:55321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const DEV_EMAIL = 'dev@reverie.local'
const DEV_PASSWORD = 'reverie-dev-password'
const SKINS = ['tryst', 'grimoire', 'aphelion', 'marrow'] as const
const MODES = ['dark', 'light'] as const

/** Establish a session directly: sign in with the seeded dev password via the JS client, then hand
 *  the tokens to the app through the URL hash. The app's supabase client has detectSessionInUrl:true,
 *  so it adopts them on load and persists the session — the same landing the magic-link verify would
 *  produce, minus the email. This avoids Mailpit, the auth redirect allow-list, and the email rate
 *  limits, so it's immune to the dev server's port. TanStack Router is path-based, leaving the hash
 *  free for supabase-js to consume. */
async function signIn(page: Page) {
  const sb = createClient(SUPABASE_URL, ANON)
  const { data, error } = await sb.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD })
  if (error || !data.session) throw new Error(`seed sign-in failed: ${error?.message ?? 'no session'}`)
  const { access_token, refresh_token } = data.session
  await page.goto(
    `/#access_token=${access_token}&refresh_token=${refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`,
  )
  // An auth-callback arrival lands on /welcome ("You're in"); the button confirms the session is set.
  await page.getByRole('button', { name: /enter your library/i }).click({ timeout: 20_000 })
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 20_000 })
}

async function setupFixtures(): Promise<{ bookId: string; clubId: string; listCode: string; shelfId: string }> {
  const sb = createClient(SUPABASE_URL, ANON)
  await sb.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD })
  const uid = (await sb.auth.getUser()).data.user!.id
  const bookId = (await sb.from('books').select('id').order('added_at').limit(1).single()).data!.id

  const club = (
    await sb
      .from('clubs')
      .insert({ title: 'A11y Read-along', unit_type: 'chapter', unit_count: 10, unit_label: 'Chapter', created_by: uid })
      .select()
      .single()
  ).data!
  await sb.from('club_members').insert({ club_id: club.id, user_id: uid, display_name: 'Dev', progress: 3 })

  // a shelf with one book, for the /shelf/$listId detail page
  const shelf = (
    await sb.from('lists').insert({ owner_id: uid, name: 'A11y Shelf', kind: 'tbr', sort_order: 999999 }).select().single()
  ).data!
  await sb.from('list_items').insert({ list_id: shelf.id, book_id: bookId, owner_id: uid, position: 1000 })

  // a series with a linked entry + a ghost slot, for the /series/$seriesName page
  const series = (
    await sb.from('series').insert({ owner_id: uid, name: 'A11y Saga', status: 'ongoing' }).select().single()
  ).data!
  await sb.from('series_entries').insert([
    { series_id: series.id, owner_id: uid, position: 1, title: 'Linked One', book_id: bookId, user_edited: true },
    { series_id: series.id, owner_id: uid, position: 2.5, label: 'novella', title: 'A11y Ghost Novella', author: 'Ghost Writer' },
  ])

  const listCode = 'A11YSMOKE'
  await sb.from('shared_docs').upsert({ key: listCode, value: { type: 'list', kind: 'list', name: 'A11y list', items: [], updatedAt: Date.now() } })
  await sb.from('shared_refs').upsert({ owner_id: uid, code: listCode, kind: 'list', name: 'A11y list' }, { onConflict: 'owner_id,code' })

  return { bookId, clubId: club.id, listCode, shelfId: shelf.id }
}

async function cleanup(clubId: string, listCode: string, shelfId: string) {
  const sb = createClient(SUPABASE_URL, ANON)
  await sb.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD })
  await sb.from('clubs').delete().eq('id', clubId)
  await sb.from('lists').delete().eq('id', shelfId)
  await sb.from('series').delete().eq('name', 'A11y Saga')
  await sb.from('shared_docs').delete().eq('key', listCode)
  await sb.from('shared_refs').delete().eq('code', listCode)
  await setProfileSkinMode('tryst', 'system') // restore the dev profile
}

/** Set the dev profile's skin + mode so the app's skin-sync applies them on the next load
 * (avoids racing the client-side sync — this also exercises the real persistence path). */
async function setProfileSkinMode(skin: string, mode: string) {
  const sb = createClient(SUPABASE_URL, ANON)
  await sb.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD })
  const uid = (await sb.auth.getUser()).data.user!.id
  await sb.from('profiles').update({ skin, mode }).eq('id', uid)
}

test('every route passes axe (no serious/critical) across all skins x both modes', async ({ page }) => {
  test.setTimeout(600_000)
  const { bookId, clubId, listCode, shelfId } = await setupFixtures()
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
          vol('The Serpent and the Wings of Night', 'Carissa Broadbent', '/landing-covers/never-king.jpg', '9781250343178'),
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
  await page.route('**/functions/v1/covers**', (route) => route.fulfill({ status: 422, json: { error: 'fetch_failed' } }))

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
    ['Series detail', `/series/${encodeURIComponent('A11y Saga')}`],
  ]
  const coreRoutes = allRoutes.filter(([name]) =>
    ['Home', 'Library', 'Book detail', 'Stats', 'Settings', 'Skins', 'Clubs', 'Indie'].includes(name),
  )

  const failures: string[] = []
  try {
    for (const skin of SKINS) {
      const routes = skin === 'tryst' ? allRoutes : coreRoutes
      for (const mode of MODES) {
        await setProfileSkinMode(skin, mode) // skin-sync picks this up on each fresh load
        // Drop the persisted query cache so the fresh profile (not a stale persisted one) loads.
        await page.evaluate(() => indexedDB.deleteDatabase('reverie-offline'))
        for (const [name, path] of routes) {
          await page.goto(path)
          await page.waitForLoadState('networkidle')
          await page.locator('main').waitFor({ state: 'visible' })
          await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
          await expect(page.locator('html')).toHaveAttribute('data-mode', mode)

          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze()
          const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
          for (const v of serious) {
            const detail = v.nodes
              .slice(0, 2)
              .map((n) => {
                const d = n.any?.[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined
                return d?.contrastRatio != null
                  ? `${String(n.target)} fg=${d.fgColor} bg=${d.bgColor} ratio=${d.contrastRatio}`
                  : String(n.target)
              })
              .join(' || ')
            failures.push(`[${skin}/${mode}] ${name} (${path}): ${v.id} (${v.nodes.length}) — ${detail}`)
          }
        }
      }
    }
  } finally {
    await cleanup(clubId, listCode, shelfId)
  }

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
    ['Welcome · expired link', '/welcome#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'],
    ['Welcome · set new password', '/welcome#type=recovery'],
  ]
  const failures: string[] = []
  for (const [name, path] of routes) {
    await page.goto(path)
    await page.locator('main').first().waitFor({ state: 'visible' })
    await page.waitForLoadState('networkidle') // let the landing's lazy below-fold chunk render before scanning
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    for (const v of results.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) {
      const detail = v.nodes
        .slice(0, 2)
        .map((n) => {
          const d = n.any?.[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined
          return d?.contrastRatio != null ? `${String(n.target)} fg=${d.fgColor} bg=${d.bgColor} ratio=${d.contrastRatio}` : String(n.target)
        })
        .join(' || ')
      failures.push(`[${name}] (${path}): ${v.id} (${v.nodes.length}) — ${detail}`)
    }
  }
  if (failures.length) console.log('axe (unauth) violations:\n' + failures.join('\n'))
  expect(failures, failures.join('\n')).toHaveLength(0)
})
