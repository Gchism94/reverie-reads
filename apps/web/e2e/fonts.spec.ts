import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// The generalized font guard (Fable 5): every typeface a designed skin depends on must actually
// load — a silent fallback to Georgia/system-ui would pass axe and every unit test while losing the
// skin's voice. The Skin Gallery calls loadAllSkinFonts(), so one authed visit loads every pairing;
// document.fonts.check() then proves each family resolved (the Fraunces guard pattern, generalized).

const SUPABASE_URL = 'http://127.0.0.1:55321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

// family → the skin that depends on it
const FAMILIES: [string, string][] = [
  ['Fraunces', 'tryst display'],
  ['Hanken Grotesk', 'tryst labels'],
  ['Space Grotesk', 'aphelion display'],
  ['Space Mono', 'aphelion labels'],
  ['Cormorant Garamond', 'grimoire display'],
  ['Spectral', 'grimoire labels'],
  ['Playfair Display', 'marrow display'],
  ['Libre Franklin', 'marrow labels'],
  ['Libre Caslon Text', 'gaslight (umbra) display'],
  ['Courier Prime', 'gaslight (umbra) typed'],
  ['EB Garamond', 'marginalia (folio) text'],
  ['Caveat', 'marginalia (folio) margin hand'],
  ['Bitter', 'hearth display'],
  ['Varela Round', 'hearth labels'],
  ['Source Serif 4', 'almanac text'],
  ['Archivo', 'almanac labels'],
  ['Baloo 2', 'firstlight (bloom) display'],
  ['Karla', 'firstlight (bloom) labels'],
]

test('every designed skin typeface actually loads (no silent fallback)', async ({ page }) => {
  const sb = createClient(SUPABASE_URL, ANON)
  const { data, error } = await sb.auth.signInWithPassword({ email: 'dev@reverie.local', password: 'reverie-dev-password' })
  if (error || !data.session) throw new Error(`seed sign-in failed: ${error?.message ?? 'no session'}`)
  const { access_token, refresh_token } = data.session
  await page.goto(
    `/#access_token=${access_token}&refresh_token=${refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`,
  )
  // An auth-callback arrival lands on /welcome ("You're in"); the button confirms the session is set.
  await page.getByRole('button', { name: /enter your library/i }).click({ timeout: 20_000 })
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 20_000 })

  await page.goto('/skins') // the gallery loads every skin's pairing
  await page.waitForTimeout(500)

  const results = await page.evaluate(async (families: string[]) => {
    // ask the font loader for each family explicitly, then report what resolved
    await Promise.all(families.map((f) => document.fonts.load(`600 16px "${f}"`).catch(() => [])))
    await document.fonts.ready
    return families.map((f) => [f, document.fonts.check(`600 16px "${f}"`)] as const)
  }, FAMILIES.map(([f]) => f))

  const missing = results.filter(([, ok]) => !ok).map(([f]) => `${f} (${FAMILIES.find(([n]) => n === f)?.[1]})`)
  expect(missing, `families that never loaded: ${missing.join(', ')}`).toHaveLength(0)
})
