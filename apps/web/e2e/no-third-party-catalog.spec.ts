import { expect, test, type Page } from './support/fixtures'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { authFailure } from './support/authError'
import { keepOfflineCacheEmpty } from './support/offlineCache'
import { ok, okUser } from './support/ok'

// Discover search e2e (docs/archive/task-discover-search.md): search field → results (deduped against the
// library, "On your shelf" for owned) → add owned / add-to-shelf unowned, and the shelf picker's
// "search everywhere" seam adding the same way. The `search` + `enrich` edge functions are STUBBED
// so the run is deterministic and offline; the real Hardcover+Google backend is exercised in the
// eyeball. A dedicated throwaway user keeps the seed + a11y sweep untouched.

const SUPABASE_URL = 'http://127.0.0.1:55321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const TEST_EMAIL = 'nogoogle-e2e@reverie.local'
const TEST_PASSWORD = 'discover-e2e-password'

test.describe.configure({ mode: 'serial' })

async function ensureUser(): Promise<void> {
  const admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  let uid = data?.users?.find((u) => u.email === TEST_EMAIL)?.id
  if (!uid) {
    uid = (
      await okUser(
        admin.auth.admin.createUser({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          email_confirm: true,
        }),
        'discover-search createUser',
      )
    ).id
  }
  await ok(
    admin
      .from('profiles')
      // mode PINNED, not 'system': this spec runs an axe contrast scan, and 'system' resolves through
      // prefers-color-scheme at runtime — so the scan would be asserted against whichever surface the
      // environment produced. Observed on PR #252's gate as a real flake (color-contrast failed one
      // run, passed the next, no code change). 'dark' matches the convention across this suite's
      // other axe/colour specs and the app's own fallback when no light preference matches.
      .upsert({ id: uid, display_name: 'Discover E2E', skin: 'tryst', mode: 'dark' }),
    'discover-search profiles upsert',
  )
}

type Client = {
  sb: SupabaseClient
  session: { access_token: string; refresh_token: string }
  uid: string
}

// One password sign-in for the whole file (the per-IP sign_in_sign_ups budget is shared with the
// heavy a11y sweep). The page-side hash sign-in doesn't count against it.
let shared: Client | null = null
async function client(): Promise<Client> {
  if (shared) return shared
  await ensureUser()
  const sb = createClient(SUPABASE_URL, ANON)
  const { data, error } = await sb.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  })
  if (error || !data.session) throw new Error(authFailure('discover-search', TEST_EMAIL, error))
  shared = { sb, session: data.session, uid: data.session.user.id }
  return shared
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

/**
 * THE GUARANTEE, asserted (fix/client-google-legs): the reader's browser never talks to a
 * third-party CATALOG. All three client-side Google Books legs were routed through Edge Functions;
 * Discover's was the one that fired on ROUTE MOUNT, with no action beyond navigating.
 *
 * This asserts the property at the only layer that can actually see it — real requests from a real
 * browser — rather than at the source level (the unit test does that) or the bundle level
 * (assert-dist-clean does that). A guarantee that isn't asserted degrades the first time someone
 * adds a fetch.
 *
 * Fonts are deliberately NOT included: fonts.googleapis.com is a separate, decided leg.
 */
test('Discover mount makes no third-party catalog request', async ({ page }) => {
  test.setTimeout(120_000)
  const c = await client()
  await signIn(page, c.session)

  const thirdParty: string[] = []
  page.on('request', (r) => {
    const u = r.url()
    if (/googleapis\.com\/books|openlibrary\.org|hardcover\.app/i.test(u)) thirdParty.push(u)
  })
  // The releases fn is stubbed to FAIL — the old code's fallback fired exactly here, so this is
  // the state that used to leak. Empty shelf is the accepted cost, and it must stay silent.
  await page.route('**/functions/v1/releases**', (r) => r.fulfill({ status: 500, json: {} }))

  await page.goto('/discover')
  await expect(page.getByRole('heading', { name: /discover/i }).first()).toBeVisible({
    timeout: 20_000,
  })
  await page.waitForTimeout(3000) // let any fallback fire if one existed

  expect(
    thirdParty,
    'Discover reached a third-party catalog from the browser. Route it through an Edge Function — ' +
      'see lib/discover.ts for why mount-time requests are the indefensible shape.',
  ).toEqual([])
})
