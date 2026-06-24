import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'http://127.0.0.1:55321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const MAILPIT = 'http://127.0.0.1:55324'
const DEV_EMAIL = 'dev@reverie.local'
const THEMES = ['nocturne', 'dawn'] as const

interface MailpitMessage {
  ID: string
  To?: { Address: string }[]
}

async function latestMagicLink(email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/messages?limit=20`)).json()) as { messages?: MailpitMessage[] }
    const msg = list.messages?.find((m) => m.To?.some((t) => t.Address === email))
    if (msg) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as { HTML?: string; Text?: string }
      const body = `${full.HTML ?? ''}${full.Text ?? ''}`
      const match = body.match(/http:\/\/127\.0\.0\.1:55321\/auth\/v1\/verify\?[^"'\s<>]+/)
      if (match) return match[0].replace(/&amp;/g, '&')
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('No magic-link email arrived in Mailpit')
}

async function signIn(page: Page) {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' }) // clear stale links
  await page.goto('/')
  await page.getByLabel('Email').fill(DEV_EMAIL)
  await page.getByRole('button', { name: /magic link/i }).click()
  const link = await latestMagicLink(DEV_EMAIL)
  await page.goto(link) // /auth/v1/verify → redirects to the app with a session
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 20_000 })
}

async function setupFixtures(): Promise<{ bookId: string; clubId: string; listCode: string }> {
  const sb = createClient(SUPABASE_URL, ANON)
  await sb.auth.signInWithPassword({ email: DEV_EMAIL, password: 'reverie-dev-password' })
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

  const listCode = 'A11YSMOKE'
  await sb.from('shared_docs').upsert({ key: listCode, value: { type: 'list', kind: 'list', name: 'A11y list', items: [], updatedAt: Date.now() } })
  await sb.from('shared_refs').upsert({ owner_id: uid, code: listCode, kind: 'list', name: 'A11y list' }, { onConflict: 'owner_id,code' })

  return { bookId, clubId: club.id, listCode }
}

async function cleanup(clubId: string, listCode: string) {
  const sb = createClient(SUPABASE_URL, ANON)
  await sb.auth.signInWithPassword({ email: DEV_EMAIL, password: 'reverie-dev-password' })
  await sb.from('clubs').delete().eq('id', clubId)
  await sb.from('shared_docs').delete().eq('key', listCode)
  await sb.from('shared_refs').delete().eq('code', listCode)
}

test('every route passes axe (no serious/critical) in both themes', async ({ page }) => {
  test.setTimeout(240_000)
  const { bookId, clubId, listCode } = await setupFixtures()
  await signIn(page)

  const routes: [string, string][] = [
    ['Home', '/'],
    ['Library', '/library'],
    ['Book detail', `/book/${bookId}`],
    ['Shelves', '/shelves'],
    ['Planner', '/planner'],
    ['Stats', '/stats'],
    ['Match', '/match'],
    ['Add', '/add'],
    ['Settings', '/settings'],
    ['Clubs', '/clubs'],
    ['Club', `/club/${clubId}`],
    ['SharedList', `/list/${listCode}`],
  ]

  const failures: string[] = []
  try {
    for (const theme of THEMES) {
      await page.evaluate((t) => localStorage.setItem('reverie.theme', t), theme)
      for (const [name, path] of routes) {
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await page.locator('main').waitFor({ state: 'visible' })

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
          failures.push(`[${theme}] ${name} (${path}): ${v.id} (${v.nodes.length}) — ${detail}`)
        }
      }
    }
  } finally {
    await cleanup(clubId, listCode)
  }

  if (failures.length) console.log('axe serious/critical violations:\n' + failures.join('\n'))
  expect(failures, failures.join('\n')).toHaveLength(0)
})
