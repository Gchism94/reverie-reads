import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from './support/fixtures'
import { authFailure } from './support/authError'
import { keepOfflineCacheEmpty } from './support/offlineCache'
import { ok, okData, okUser } from './support/ok'

const SUPABASE_URL = 'http://127.0.0.1:55321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const PASSWORD = 'household-library-e2e-password'

test.describe.configure({ mode: 'serial' })
test.use({ viewport: { width: 390, height: 844 } })

type Session = { access_token: string; refresh_token: string }
type Account = { email: string; uid: string; session: Session; displayName: string }

const admin = createClient(SUPABASE_URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let owner: Account
let member: Account
let householdId = ''
let projectName = ''

const fixtureEmail = (role: string): string =>
  `household-library-${projectName}-${role}-e2e@reverie.local`

async function account(role: string, displayName: string): Promise<Account> {
  const email = fixtureEmail(role)
  const uid = (
    await okUser(
      admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }),
      `household-library ${role} createUser`,
    )
  ).id

  await ok(
    admin
      .from('profiles')
      .upsert({ id: uid, display_name: displayName, skin: 'tryst', mode: 'dark' }),
    `household-library ${role} profile upsert`,
  )

  const sb = createClient(SUPABASE_URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD })
  if (error || !data.session)
    throw new Error(authFailure(`household-library ${role}`, email, error))
  return { email, uid, session: data.session, displayName }
}

async function removeFixtureAccounts(): Promise<void> {
  const users = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (users.error) throw users.error
  const fixtures = users.data.users.filter(
    (user) => user.email === fixtureEmail('owner') || user.email === fixtureEmail('member'),
  )
  const userIds = fixtures.map((user) => user.id)
  if (userIds.length === 0) return

  const memberships = await ok(
    admin.from('household_members').select('household_id').in('user_id', userIds),
    'household-library prior memberships read',
  )
  const householdIds = [...new Set((memberships ?? []).map((row) => row.household_id))]
  if (householdIds.length > 0) {
    await ok(
      admin.from('households').delete().in('id', householdIds),
      'household-library prior households delete',
    )
  }

  for (const user of fixtures) {
    await ok(admin.auth.admin.deleteUser(user.id), `household-library delete ${user.email}`)
  }
}

async function seedDuplicateBooks(): Promise<void> {
  // EVERY ROW GETS EVERY COLUMN THE BATCH USES. PostgREST unions the keys in a bulk insert,
  // otherwise an omitted possession flag becomes an explicit NULL and violates its constraint.
  // Private values are deliberately populated so accidental Book coercion is visible below.
  const base = {
    author_first: 'Quill',
    author_last: 'Marrowbane',
    authors_display: 'Quill Marrowbane',
    genre: 'literary',
    status: 'standalone',
    ownership: 'owned',
    borrowed: false,
    wishlist: false,
    owned_physical: null as string | null,
    owned_ebook: false,
    owned_audiobook: false,
    read_status: 'unset',
    fave: false,
    rating: null as number | null,
    intensity: null as number | null,
    darkness: null as number | null,
    progress: null as number | null,
    plan_y: null as number | null,
  }

  await ok(
    admin.from('books').insert([
      {
        ...base,
        owner_id: owner.uid,
        title: `Household Duplicate ${projectName}`,
        owned_physical: 'hardcover',
        read_status: 'Read',
        fave: true,
        rating: 5,
        intensity: 5,
        darkness: 5,
        progress: 100,
        plan_y: 2027,
      },
      {
        ...base,
        owner_id: member.uid,
        title: `Household Duplicate ${projectName}`,
        borrowed: true,
        wishlist: true,
        owned_physical: 'paperback',
        owned_ebook: true,
        read_status: 'DNF',
        rating: 1,
        intensity: 1,
        darkness: 1,
        progress: 12,
        plan_y: 2028,
      },
    ]),
    'household-library books insert',
  )
}

async function signIn(page: Page, session: Session) {
  await keepOfflineCacheEmpty(page)
  await page.addInitScript(() => localStorage.setItem('reverie.onboarded', '1'))
  await page.goto(
    `/#access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`,
  )
  await page.getByRole('button', { name: /enter your library/i }).click({ timeout: 20_000 })
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 20_000 })
}

test.beforeAll(async ({ browserName }, workerInfo) => {
  if (browserName !== 'chromium')
    throw new Error(`household-library requires chromium, got ${browserName}`)
  projectName = workerInfo.project.name
  await removeFixtureAccounts()
  owner = await account('owner', `Avery ${projectName}`)
  member = await account('member', `Blake ${projectName}`)
})

test.afterAll(async () => {
  if (householdId) {
    await ok(
      admin.from('households').delete().eq('id', householdId),
      'household-library household cleanup',
    )
  }
  await removeFixtureAccounts()
})

test('two linked personal libraries appear together without exposing personal controls', async ({
  page,
}) => {
  await signIn(page, owner.session)

  // Unknown query values fail closed to the personal library.
  await page.goto('/library?scope=not-a-scope')
  await expect(page.getByRole('button', { name: 'Personal' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // A reader can enter the scope before being linked, even with an empty personal library.
  await page.getByRole('button', { name: 'Household' }).click()
  await expect(page.getByText('No household linked')).toBeVisible()

  householdId = await okData(
    admin.rpc('link_household', {
      p_name: `Household Library ${projectName}`,
      p_owner: owner.uid,
      p_members: [member.uid],
    }),
    'household-library link household',
  )
  await page.reload()
  await expect(page.getByText('No household books yet')).toBeVisible()

  await seedDuplicateBooks()
  await page.reload()

  await expect(page.getByRole('button', { name: 'Household' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByTestId('household-book-card')).toHaveCount(2)

  const ownerCard = page.locator(`[data-owner="${owner.uid}"]`)
  const memberCard = page.locator(`[data-owner="${member.uid}"]`)
  await expect(ownerCard).toContainText(`${owner.displayName} (you)`)
  await expect(memberCard).toContainText(member.displayName)
  await expect(ownerCard).toContainText(`Household Duplicate ${projectName}`)
  await expect(memberCard).toContainText(`Household Duplicate ${projectName}`)
  expect(
    await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    })),
  ).toEqual({ client: 390, scroll: 390 })

  await memberCard.click()
  const detail = page.getByRole('dialog', { name: /household details/i })
  await expect(detail).toContainText(`From ${member.displayName}'s personal library`)
  await expect(detail).toContainText('Read-only household view')
  await expect(
    detail.getByText(/rating|favourite|favorite|read status|notes|progress/i),
  ).toHaveCount(0)
  await expect(
    detail.getByRole('button', { name: /favourite|favorite|cover|shelf|edit/i }),
  ).toHaveCount(0)
  await expect(detail.getByRole('link')).toHaveCount(0)
  await expect(page).toHaveURL(/\/library\?scope=household$/)
})

test('the second reader gets the same household view with their own identity marked', async ({
  page,
}) => {
  await signIn(page, member.session)
  await page.goto('/library?scope=household')

  await expect(page.locator(`[data-owner="${member.uid}"]`)).toContainText(
    `${member.displayName} (you)`,
  )
  await expect(page.locator(`[data-owner="${owner.uid}"]`)).toContainText(owner.displayName)
  await page.locator(`[data-owner="${member.uid}"]`).click()
  const detail = page.getByRole('dialog', { name: /household details/i })
  await expect(detail).toContainText('Read-only household view')
  await expect(detail.getByRole('link')).toHaveCount(0)
})

test('removing the other account leaves a read-only one-member household', async ({ page }) => {
  await okUser(admin.auth.admin.deleteUser(member.uid), 'household-library member delete')

  await signIn(page, owner.session)
  await page.goto('/library?scope=household')

  await expect(page.getByText(/only household member left/i)).toBeVisible()
  await expect(page.getByTestId('household-book-card')).toHaveCount(1)
  await expect(page.locator(`[data-owner="${owner.uid}"]`)).toContainText(
    `${owner.displayName} (you)`,
  )
  await expect(page.locator(`[data-owner="${member.uid}"]`)).toHaveCount(0)
})
