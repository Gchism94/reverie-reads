import { expect, test, type Page } from '../support/fixtures'
import { createClient } from '@supabase/supabase-js'
import { authFailure } from '../support/authError'
import { keepOfflineCacheEmpty } from '../support/offlineCache'
import { ok, okUser } from '../support/ok'
import { SKIN_ORDER, type SkinId } from '@reverie/core'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

/**
 * SURFACE MIGRATION — per-site visual baseline and diff.
 *
 * Batch 0's instrument. Run it on `main` to capture a baseline, run it again after each migration
 * batch, and it reports WHICH SITE changed rather than "N pixels differ".
 * Scope, batching and the reasoning: `docs/audits/surface-primitive-scope.md`.
 *
 * ── WHY THIS IS AN AUDIT AND NOT A SNAPSHOT GATE ────────────────────────────────────────────────
 * Deliberately NOT `toHaveScreenshot` in `pnpm e2e`. A snapshot suite that runs on every PR goes
 * stale, gets a blanket `--update-snapshots` the first time an unrelated change moves a pixel, and
 * from then on certifies nothing. `.audit.ts` cannot match the main config's default `testMatch`, so
 * this is opt-in per batch and a green `pnpm e2e` keeps meaning "the guards passed".
 *
 * ── WHY PER-SITE CROPS AND NOT FULL PAGES ───────────────────────────────────────────────────────
 * A full-page diff goes red the moment any unrelated content shifts — a different seeded book, a
 * changed count, a re-wrapped line — and then the signal has to be re-established by eye every time.
 * Cropping each surface's own bounding box keeps a difference attributable to one migrated site.
 *
 * ── THE LIMIT, STATED UP FRONT ──────────────────────────────────────────────────────────────────
 * A pixel diff answers "did this change", never "is the change correct". A genuinely improved radius
 * and a regression are the same red. This narrows where to look; a person still rules.
 *
 * ── KNOWN LIMITATION — THE BASELINE IS NOT YET TRUSTWORTHY (Batch 0, unresolved) ────────────────
 * Two IDENTICAL runs, no code change between them, still report 4-6 of 62 crops as "changed", and
 * it is a DIFFERENT set each time. Measured while building this, in order:
 *
 *   no motion handling                        52 / 62 changed
 *   + reducedMotion + frozen animations        3 / 62
 *   + ambient star field hidden                6 / 62
 *   + settle() replacing the fixed timeout   4-6 / 62
 *
 * So the residual is neither motion nor a too-short wait — those are fixed. The varying set points
 * at per-render content (an empty-state panel populated in one capture and not the next). It is not
 * yet diagnosed.
 *
 * WHY THIS BLOCKS BATCH 1 RATHER THAN BEING A FOOTNOTE: batch 1's entire design is that its diff
 * should be EMPTY, because those 25 sites already take radius and background from tokens — a
 * non-empty diff there means `Surface` itself is wrong. A 4-6 site noise floor makes exactly that
 * signal unreadable. The instrument has to reach 0 on a no-op re-run before it can certify anything.
 *
 * Tuning was stopped here deliberately rather than continued until the number looked acceptable.
 *
 * ── RUN IT ──────────────────────────────────────────────────────────────────────────────────────
 *   # on main, before any migration:
 *   pnpm --filter @reverie/web exec playwright test -c playwright.audit.config.ts \
 *     --grep "surface visual" -- --baseline
 *   SURFACE_BASELINE=1 pnpm --filter @reverie/web exec playwright test \
 *     -c playwright.audit.config.ts --grep "surface visual"
 *
 *   # after a batch, on the batch branch (compares against the stored baseline):
 *   pnpm --filter @reverie/web exec playwright test -c playwright.audit.config.ts \
 *     --grep "surface visual"
 */

/**
 * reducedMotion is not a nicety here — it is what makes the baseline mean anything. The ambient
 * night sky (`rv-anim`: drift + twinkle) renders BEHIND every surface, and `--card` carries alpha in
 * most skins, so a translucent card shows a moving sky through itself. Measured: without this, a
 * re-capture with NO code change reported 52 of 62 crops as "changed" — the instrument reading its
 * own animation. The app already disables that drift under `prefers-reduced-motion` (a11y
 * requirement), so this rides an existing, tested path rather than a special capture mode.
 */
test.use({ stubFonts: false, reducedMotion: 'reduce' })

const SUPABASE_URL = 'http://127.0.0.1:55321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const EMAIL = 'surface-visual-e2e@reverie.local'
const PASSWORD = 'surface-visual-password'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = join(HERE, '..', '..')
const OUT = join(WEB_ROOT, 'audit-output', 'surface-visual')
const BASELINE = join(OUT, 'baseline')
const CURRENT = join(OUT, 'current')

/** Writing a baseline is explicit. Without it, a run compares — it never silently re-baselines. */
const IS_BASELINE = process.env.SURFACE_BASELINE === '1'

/**
 * Routes chosen for surface DENSITY, not coverage of the app: these carry the bulk of the 72 and
 * every tone/radius combination the migration will touch. Adding routes is cheap; the constraint is
 * that a route must render its surfaces without interaction, since a crop of a closed dialog is a
 * crop of nothing.
 */
const ROUTES: readonly string[] = [
  '/',
  '/shelves',
  '/discover',
  '/add',
  '/settings',
  '/clubs',
  '/review',
  '/planner',
  '/stats',
  '/match',
]

/**
 * The 18 combos are the point — a skin-driven radius that regresses in ONE skin is exactly what a
 * single-skin check misses. `SURFACE_SKINS` trims it while iterating on the harness itself.
 */
const MODES = ['light', 'dark'] as const
const SKIN_FILTER = (process.env.SURFACE_SKINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const SKINS: SkinId[] = SKIN_FILTER.length
  ? SKIN_ORDER.filter((s) => SKIN_FILTER.includes(s))
  : [...SKIN_ORDER]

type Client = {
  sb: ReturnType<typeof createClient>
  admin: ReturnType<typeof createClient>
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
  if (!uid)
    uid = (
      await okUser(
        admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true }),
        'surface-visual createUser',
      )
    ).id
  await ok(
    admin
      .from('profiles')
      .upsert({ id: uid, display_name: 'Surface Visual', skin: 'tryst', mode: 'dark' }),
    'surface-visual profiles upsert',
  )
  const sb = createClient(SUPABASE_URL, ANON)
  const { data: s, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error || !s.session) throw new Error(authFailure('surface-visual', EMAIL, error))
  shared = { sb, admin, session: s.session, uid: s.session.user.id }
  return shared
}

/**
 * Fixed content. Every value is deterministic — no dates, no counts that drift, no randomness —
 * because the baseline is only worth anything if a re-run with no code change produces identical
 * crops. Non-determinism here would read as a migration regression.
 */
async function seed(c: Client): Promise<void> {
  const { data: existing } = await c.sb.from('books').select('id').eq('owner_id', c.uid)
  const ids = ((existing as { id: string }[]) ?? []).map((b) => b.id)
  if (ids.length) {
    await ok(c.sb.from('list_items').delete().in('book_id', ids), 'surface items delete')
    await ok(c.sb.from('books').delete().in('id', ids), 'surface books delete')
  }
  await ok(c.sb.from('lists').delete().eq('owner_id', c.uid), 'surface lists delete')

  const rows = Array.from({ length: 8 }, (_, i) => ({
    owner_id: c.uid,
    title: `Surface Probe ${String(i + 1).padStart(2, '0')}`,
    author_first: 'Nell',
    author_last: 'Marrow',
    genre: 'fantasy',
    status: 'standalone',
    series: null,
    position: null,
    ownership: 'owned',
    borrowed: false,
    wishlist: false,
    read_status: 'Read',
  }))
  const { error } = await c.sb.from('books').insert(rows)
  if (error) throw new Error(`surface-visual seed failed: ${JSON.stringify(error)}`)
  await ok(
    c.sb
      .from('lists')
      .insert({ owner_id: c.uid, name: 'Surface Shelf', kind: 'collection', sort_order: 1 }),
    'surface list insert',
  )
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
 * Belt and braces on top of `reducedMotion`. Anything still animating — a CSS transition mid-flight,
 * a cover fading in — moves pixels between two captures that should be identical. Killing motion
 * outright is safe for a still capture and removes a whole class of false "changed".
 */
async function freezeMotion(page: Page) {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
    }
    /* Hide the ambient night sky. Freezing motion is not enough: the star field's POSITIONS are
       randomised per mount, so every translucent or bare surface showed a different sky through
       itself on each load. That was the last 3 of the 62 crops still flagging as changed with no
       code change. This measures surface chrome, not the wallpaper behind it. */
    .rv-sky-star, .rv-anim { display: none !important; }
    .pointer-events-none.fixed.inset-0.-z-10 { display: none !important; }`,
  })
}

/**
 * Wait for the page to STOP CHANGING, rather than for a fixed number of milliseconds.
 *
 * A `waitForTimeout(900)` is a guess about how long queries, images and re-renders take, and when
 * the guess is short the crop catches a half-rendered panel — which is why the diff's "changed" set
 * varied run to run (an empty-state panel in one capture, populated in the next). This waits for the
 * network to go idle and then for the DOM to stop mutating, so the capture happens at a settled
 * state instead of at a stopwatch reading.
 */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page
    .evaluate(
      () =>
        new Promise<void>((resolve) => {
          let t = setTimeout(done, 400)
          const obs = new MutationObserver(() => {
            clearTimeout(t)
            t = setTimeout(done, 400)
          })
          obs.observe(document.body, { subtree: true, childList: true, attributes: true })
          function done() {
            obs.disconnect()
            resolve()
          }
          setTimeout(done, 6000) // hard cap: a page that never settles must not hang the sweep
        }),
    )
    .catch(() => {})
}

async function stub(page: Page) {
  for (const p of ['search', 'enrich', 'embed', 'releases', 'series', 'covers', 'taste', 'geo'])
    await page.route(`**/functions/v1/${p}**`, (r) => r.fulfill({ json: {} }))
  await page.route('**/books/v1/volumes**', (r) => r.fulfill({ json: { items: [] } }))
}

/**
 * Find the surfaces on the current page and tag each with a STABLE identity.
 *
 * The identity cannot be a DOM index — migrating a site can change the tree — and it cannot be the
 * class list, because changing the class list is the entire point of the migration. It is instead
 * `route + ordinal among surfaces sorted by document position`, which survives a className rewrite
 * and is stable as long as the seeded content is. That stability is exactly what the seed above
 * exists to guarantee.
 */
function tagSurfaces() {
  const PAD = /\b(p|px|py|pt|pb|pl|pr)-/
  const INTERACTIVE = new Set(['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A', 'LABEL'])
  const found: { idx: number; tag: string; cls: string }[] = []
  let i = 0
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
    const cls = typeof el.className === 'string' ? el.className : ''
    // Match the audit's own population definition: bordered + padded, non-interactive, and not a
    // control/field kit carrier. Post-migration a Surface still emits `border border-line`, so the
    // same query keeps finding the same boxes on both sides of the diff.
    if (!/border\s+border-line/.test(cls) || !PAD.test(cls)) continue
    if (INTERACTIVE.has(el.tagName)) continue
    if (/\bskin-control\b|\bskin-field\b/.test(cls)) continue
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 8) continue
    el.setAttribute('data-surface-probe', String(i))
    found.push({ idx: i, tag: el.tagName.toLowerCase(), cls: cls.slice(0, 120) })
    i++
  }
  return found
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex').slice(0, 16)

test('surface visual — per-site crops across skins x modes', async ({ page }) => {
  test.setTimeout(45 * 60_000)
  const c = await client()
  await seed(c)
  await stub(page)
  await signIn(page, c.session)

  const dir = IS_BASELINE ? BASELINE : CURRENT
  mkdirSync(dir, { recursive: true })
  const manifest: Record<string, { hash: string; tag: string; cls: string }> = {}
  const unstable: string[] = []

  await page.setViewportSize({ width: 1280, height: 900 })

  for (const skin of SKINS) {
    for (const mode of MODES) {
      await ok(
        c.admin.from('profiles').update({ skin, mode }).eq('id', c.uid),
        'surface-visual skin update',
      )
      for (const route of ROUTES) {
        await page.goto(route)
        await settle(page)
        await freezeMotion(page)
        await page.waitForTimeout(150)

        // A crop taken under the wrong skin is filed against a combination that was never on
        // screen — the same trap the visual-overflow audit had to close. Refuse it loudly.
        const applied = await page.evaluate(() => ({
          skin: document.documentElement.dataset.skin,
          mode: document.documentElement.dataset.mode,
        }))
        if (applied.skin !== skin || applied.mode !== mode)
          throw new Error(
            `surface-visual: asked ${skin}/${mode}, page rendered ${applied.skin}/${applied.mode} at ${route}`,
          )

        const found = await page.evaluate(tagSurfaces)
        for (const f of found) {
          const key = `${route.replace(/[^\w]+/g, '_') || 'root'}--${skin}-${mode}--${f.idx}`
          const loc = page.locator(`[data-surface-probe="${f.idx}"]`)
          const shot = await loc.screenshot().catch(() => null)
          if (!shot) continue
          // SHOOT IT TWICE. Two captures milliseconds apart must be identical; if they are not,
          // this crop is unstable and any "changed" it reports later is noise, not a migration.
          // Measuring that per crop is what makes the instrument's own reliability visible instead
          // of assumed — the first version of this file asserted determinism by comparing a
          // manifest against its own PNGs, which is true by construction and proved nothing.
          const shot2 = await loc.screenshot().catch(() => null)
          if (!shot2 || sha(shot) !== sha(shot2)) unstable.push(key)
          writeFileSync(join(dir, `${key}.png`), shot)
          manifest[key] = { hash: sha(shot), tag: f.tag, cls: f.cls }
        }
      }
    }
  }

  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  const total = Object.keys(manifest).length
  console.log(
    `surface-visual: ${IS_BASELINE ? 'BASELINE' : 'CURRENT'} — ${total} crops across ` +
      `${SKINS.length} skins x ${MODES.length} modes x ${ROUTES.length} routes → ${dir}`,
  )
  expect(total, 'no surfaces were captured — the probe found nothing to crop').toBeGreaterThan(0)

  // The instrument's own honesty check, measured rather than asserted. A non-zero count here means
  // every diff this run produces is suspect.
  if (unstable.length) {
    console.log(
      `surface-visual: ${unstable.length}/${total} crops were UNSTABLE between two captures taken ` +
        `milliseconds apart. Any "changed" below is noise until this is zero. Sample: ` +
        unstable.slice(0, 8).join(', '),
    )
  }
  expect(
    unstable.length,
    `${unstable.length} crops differ between two back-to-back captures — the harness is measuring ` +
      `its own motion, not the migration. Do not trust a diff until this is 0.`,
  ).toBe(0)

  if (IS_BASELINE) return

  // ── compare ────────────────────────────────────────────────────────────────────────────────
  const basePath = join(BASELINE, 'manifest.json')
  if (!existsSync(basePath)) {
    console.log(
      'surface-visual: NO BASELINE FOUND — capture one on main first:\n' +
        '  SURFACE_BASELINE=1 pnpm --filter @reverie/web exec playwright test ' +
        '-c playwright.audit.config.ts --grep "surface visual"',
    )
    return
  }
  const base = JSON.parse(readFileSync(basePath, 'utf8')) as typeof manifest
  const changed: string[] = []
  const added: string[] = []
  const removed: string[] = []
  for (const k of Object.keys(manifest)) {
    if (!(k in base)) added.push(k)
    else if (base[k]!.hash !== manifest[k]!.hash) changed.push(k)
  }
  for (const k of Object.keys(base)) if (!(k in manifest)) removed.push(k)

  const lines = [
    `# Surface visual diff`,
    ``,
    `- baseline crops: ${Object.keys(base).length}`,
    `- current crops:  ${Object.keys(manifest).length}`,
    `- **changed: ${changed.length}**  ·  added: ${added.length}  ·  removed: ${removed.length}`,
    ``,
    `A pixel diff answers "did this change", never "is it correct" — every entry below needs a look.`,
    ``,
  ]
  for (const [label, list] of [
    ['changed', changed],
    ['added (a surface exists now that did not before)', added],
    [
      'removed (a surface the baseline had is gone — check it was not dropped by accident)',
      removed,
    ],
  ] as const) {
    lines.push(`## ${label} — ${list.length}`, '')
    for (const k of list.slice(0, 200))
      lines.push(`- \`${k}\` ${manifest[k]?.cls ? `— \`${manifest[k]!.cls}\`` : ''}`)
    if (list.length > 200) lines.push(`- …and ${list.length - 200} more (truncated in this report)`)
    lines.push('')
  }
  writeFileSync(join(OUT, 'diff.md'), lines.join('\n'))
  console.log(lines.slice(0, 8).join('\n'))
  console.log(`surface-visual: wrote ${join(OUT, 'diff.md')}`)
})

/**
 * NOTE — there is deliberately no second "determinism" test here any more.
 *
 * The first version compared the manifest's hashes against the PNGs the SAME run had just written.
 * That is true by construction: it re-hashed the bytes it had already hashed. It passed while the
 * harness was in fact reporting 52 of 62 crops as changed between independent runs, which is
 * precisely the kind of green that stops anyone looking.
 *
 * Stability is now measured where it can actually fail — inside the capture, by shooting every crop
 * twice and asserting the pair is identical. See `unstable` above.
 */
