import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { authFailure } from './support/authError'

// DIAGNOSIS ONLY (fix/a11y-contrast-diagnosis) — deleted with the branch, never merged to main.
//
// Question under test: when the CI runner reports `.skin-btn-secondary` at ratio 1.11 on
// [tryst/dark] Home, is that the app's real settled state, or axe photographing an unsettled one?
// The two hexes axe reported are from DIFFERENT MODES of the same skin — #351523 is tryst/LIGHT's
// --ink, #1d0e29 is tryst/DARK's --card-solid — so the page cannot have been in one coherent mode
// for both reads. Candidate mechanism (to be verified, not assumed): the boot script resolves
// mode 'system' via prefers-color-scheme pre-paint (Playwright default colorScheme = light), the
// profile's explicit mode arrives later via useSkinSync → hydrate() → a data-mode flip after
// first paint. This spec instruments that window instead of asserting anything about it.
//
// It REPLICATES the sweep's exact pre-scan sequence, then records:
//   1. every <html> data-skin/data-mode attribute change from document-start (MutationObserver
//      installed via addInitScript — catches the boot script's very first stamp),
//   2. a 50ms sampler of the button's computed color/background + resolved custom props,
//   3. what the sweep's own toHaveAttribute waits observed, timestamped against 1 and 2,
//   4. an axe color-contrast-only pass at the same point the sweep runs its full pass,
//   5. environment: matchMedia, localStorage, profile row, ancestor chain, in-flight animations.
// The test never fails on the contrast result — a diagnostic that dies mid-diagnosis reports
// nothing. Everything lands in the CI log as one JSON blob between BEGIN/END markers.

const SUPABASE_URL = 'http://127.0.0.1:55321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const DEV_EMAIL = 'dev@reverie.local'
const DEV_PASSWORD = 'reverie-dev-password'
const BTN = '.skin-btn-secondary'

async function devSignIn() {
  const sb = createClient(SUPABASE_URL, ANON)
  const { data, error } = await sb.auth.signInWithPassword({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
  })
  if (error || !data.session) throw new Error(authFailure('contrast-diagnosis', DEV_EMAIL, error))
  return { sb, session: data.session, uid: data.session.user.id }
}

test('diagnosis: what exactly does axe see on tryst/dark Home, and when', async ({ page }) => {
  test.setTimeout(180_000)
  const t0 = Date.now()
  const stamp = () => Date.now() - t0

  // ── the sweep's exact setup: profile says tryst/dark BEFORE the page ever loads ──
  const dev = await devSignIn()
  await dev.sb.from('profiles').update({ skin: 'tryst', mode: 'dark' }).eq('id', dev.uid)

  // Recorder at document-start on EVERY navigation: <html> attribute flips + a 50ms sampler of
  // the first .skin-btn-secondary's computed colors. Times are performance.now() (per-load).
  await page.addInitScript(() => {
    type Sample = {
      t: number
      skin?: string
      mode?: string
      color?: string
      bg?: string
      ink?: string
      cardSolid?: string
      animations?: number
    }
    const diag = {
      attrEvents: [] as { t: number; attr: string; value: string | null }[],
      samples: [] as Sample[],
      initError: null as string | null,
    }
    ;(window as unknown as { __diag: typeof diag }).__diag = diag
    // Everything below is guarded: a silent crash here previously left the shell object with
    // empty arrays and no explanation — a diagnostic must record its own failure, not swallow it.
    try {
      // Init scripts run before <html> exists, so observe the DOCUMENT with subtree — the boot
      // script's own dataset writes are then attribute mutations on a descendant and still land.
      new MutationObserver((muts) => {
        for (const m of muts)
          if (m.type === 'attributes' && m.attributeName && m.target === document.documentElement)
            diag.attrEvents.push({
              t: performance.now(),
              attr: m.attributeName,
              value: document.documentElement.getAttribute(m.attributeName),
            })
      }).observe(document, {
        attributes: true,
        subtree: true,
        attributeFilter: ['data-skin', 'data-mode'],
      })
      diag.attrEvents.push({
        t: performance.now(),
        attr: 'data-mode@init',
        value: document.documentElement
          ? document.documentElement.getAttribute('data-mode')
          : '(no documentElement yet)',
      })
      setInterval(() => {
        try {
          const r = document.documentElement
          const btn = document.querySelector('.skin-btn-secondary')
          const rootCs = getComputedStyle(r)
          const s: Sample = {
            t: performance.now(),
            skin: r.dataset.skin,
            mode: r.dataset.mode,
            ink: rootCs.getPropertyValue('--ink').trim(),
            cardSolid: rootCs.getPropertyValue('--card-solid').trim(),
            animations: document.getAnimations ? document.getAnimations().length : -1,
          }
          if (btn) {
            const cs = getComputedStyle(btn)
            s.color = cs.color
            s.bg = cs.backgroundColor
          }
          diag.samples.push(s)
        } catch (e) {
          diag.initError = `sampler: ${String(e)}`
        }
      }, 50)
    } catch (e) {
      diag.initError = `init: ${String(e)}`
    }
  })

  // ── the sweep's exact pre-scan sequence, each step timestamped ──
  const timeline: { step: string; t: number }[] = []
  const { access_token, refresh_token } = dev.session
  await page.goto(
    `/#access_token=${access_token}&refresh_token=${refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`,
  )
  await page.getByRole('button', { name: /enter your library/i }).click({ timeout: 20_000 })
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 20_000 })
  timeline.push({ step: 'signed in', t: stamp() })
  await page.evaluate(() => indexedDB.deleteDatabase('reverie-offline'))

  await page.goto('/')
  timeline.push({ step: 'goto / returned', t: stamp() })
  await page.waitForLoadState('networkidle')
  timeline.push({ step: 'networkidle', t: stamp() })
  await page.locator('main').waitFor({ state: 'visible' })
  timeline.push({ step: 'main visible', t: stamp() })
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'tryst')
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark')
  timeline.push({ step: 'sweep assertions passed (data-skin=tryst, data-mode=dark)', t: stamp() })

  // ── axe, color-contrast only, exactly where the sweep would run its full pass ──
  const axe = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  timeline.push({ step: 'axe analyze() returned', t: stamp() })
  const contrast = axe.violations.map((v) => ({
    id: v.id,
    nodes: v.nodes.slice(0, 5).map((n) => ({
      target: String(n.target),
      data: n.any?.[0]?.data as unknown,
    })),
  }))

  // ── environment + the button's ancestor chain as axe would composite it ──
  const env = await page.evaluate((btnSel) => {
    const root = document.documentElement
    const btn = document.querySelector(btnSel)
    const chain: {
      tag: string
      cls: string
      skin?: string
      mode?: string
      bg: string
      opacity: string
    }[] = []
    for (let el = btn; el; el = el.parentElement) {
      const cs = getComputedStyle(el)
      chain.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 60),
        skin: (el as HTMLElement).dataset?.skin,
        mode: (el as HTMLElement).dataset?.mode,
        bg: cs.backgroundColor,
        opacity: cs.opacity,
      })
    }
    const btnCs = btn ? getComputedStyle(btn) : null
    return {
      prefersLight: matchMedia('(prefers-color-scheme: light)').matches,
      prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
      localStorageSkin: localStorage.getItem('reverie.skin'),
      localStorageMode: localStorage.getItem('reverie.mode'),
      htmlSkin: root.dataset.skin,
      htmlMode: root.dataset.mode,
      btnFound: !!btn,
      btnColor: btnCs?.color,
      btnBg: btnCs?.backgroundColor,
      btnTransition: btnCs ? `${btnCs.transitionProperty} ${btnCs.transitionDuration}` : null,
      inFlightAnimations: document.getAnimations ? document.getAnimations().length : -1,
      ancestorChain: chain,
      ua: navigator.userAgent,
    }
  }, BTN)

  const recorder = await page.evaluate(() => (window as unknown as { __diag: unknown }).__diag)
  const { data: profileRow } = await dev.sb
    .from('profiles')
    .select('skin, mode')
    .eq('id', dev.uid)
    .single()

  const report = { timeline, axeContrastViolations: contrast, env, profileRow, recorder }
  console.log(
    'CONTRAST-DIAGNOSIS-BEGIN\n' + JSON.stringify(report, null, 1) + '\nCONTRAST-DIAGNOSIS-END',
  )
  await test.info().attach('contrast-diagnosis.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  })

  // The one thing this spec does assert: it measured what it came to measure.
  expect(env.btnFound, 'the .skin-btn-secondary under diagnosis exists on Home').toBe(true)
})
