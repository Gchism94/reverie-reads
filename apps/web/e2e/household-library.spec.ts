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

type Session = { access_token: string; refresh_token: string }
type Account = { email: string; uid: string; session: Session; displayName: string }

const admin = createClient(SUPABASE_URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let owner: Account
let member: Account
let replacement: Account | undefined
let householdId = ''
let projectName = ''
let replacementBookId = ''
let seeded:
  | {
      ownerBookId: string
      memberBookId: string
      sentinels: { tag: string; note: string; trope: string; mood: string }
    }
  | undefined

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
  const fixtureEmails = new Set(
    ['owner', 'member', 'replacement'].map((role) => fixtureEmail(role)),
  )
  const fixtures = users.data.users.filter((user) => user.email && fixtureEmails.has(user.email))
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

async function seedDuplicateBooks(): Promise<NonNullable<typeof seeded>> {
  // EVERY ROW GETS EVERY COLUMN THE BATCH USES. PostgREST unions the keys in a bulk insert,
  // otherwise an omitted possession flag becomes an explicit NULL and violates its constraint.
  // Values span both scopes: tags/tropes are deliberately household-shared; note/mood stay private.
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
  const sentinels = {
    tag: `HOUSEHOLD_TAG_${projectName}`,
    note: `PRIVATE_NOTE_${projectName}`,
    trope: `HOUSEHOLD_TROPE_${projectName}`,
    mood: `PRIVATE_MOOD_${projectName}`,
  }

  const books = await ok(
    admin
      .from('books')
      .insert([
        {
          ...base,
          owner_id: owner.uid,
          title: `Household Duplicate ${projectName}`,
          tags: [sentinels.tag],
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
          tags: [sentinels.tag],
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
      ])
      .select('id, owner_id'),
    'household-library books insert',
  )
  const ownerBookId = books?.find((book) => book.owner_id === owner.uid)?.id
  const memberBookId = books?.find((book) => book.owner_id === member.uid)?.id
  if (!ownerBookId || !memberBookId) throw new Error('household-library seed IDs missing')

  await ok(
    admin.from('reads').insert({
      book_id: memberBookId,
      owner_id: member.uid,
      notes: sentinels.note,
      read_on: '2026-08-24',
    }),
    'household-library private note insert',
  )
  const trope = await okData(
    admin
      .from('tropes')
      .insert({ owner_id: member.uid, name: sentinels.trope, facet: 'vibe' })
      .select('id')
      .single(),
    'household-library private trope insert',
  )
  await ok(
    admin.from('book_tropes').insert({
      book_id: memberBookId,
      trope_id: trope.id,
      owner_id: member.uid,
    }),
    'household-library private trope link',
  )
  const mood = await okData(
    admin
      .from('moods')
      .insert({ owner_id: member.uid, name: sentinels.mood })
      .select('id')
      .single(),
    'household-library private mood insert',
  )
  await ok(
    admin.from('book_moods').insert({
      book_id: memberBookId,
      mood_id: mood.id,
      owner_id: member.uid,
    }),
    'household-library private mood link',
  )

  return { ownerBookId, memberBookId, sentinels }
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

test('scope controls remain available through personal and household loading failures', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'rest', 'desktop route-state coverage')

  let releasePersonal!: () => void
  const personalGate = new Promise<void>((resolve) => {
    releasePersonal = resolve
  })
  const booksPattern = '**/rest/v1/books*'
  await page.route(booksPattern, async (route) => {
    await personalGate
    await route.fulfill({ status: 500, json: { message: 'forced personal failure' } })
  })
  await signIn(page, owner.session)
  await page.goto('/library')
  await expect(page.getByRole('button', { name: 'Personal' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Household' })).toBeVisible()
  releasePersonal()
  await expect(page.getByText(/couldn’t load your library/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Household' })).toBeVisible()
  await page.unroute(booksPattern)

  let releaseHousehold!: () => void
  const householdGate = new Promise<void>((resolve) => {
    releaseHousehold = resolve
  })
  const rosterPattern = '**/rest/v1/rpc/household_roster'
  await page.route(rosterPattern, async (route) => {
    await householdGate
    await route.fulfill({ status: 500, json: { message: 'forced household failure' } })
  })
  await page.goto('/library?scope=household')
  await expect(page.getByText('Loading the household library…')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Personal' })).toBeVisible()
  await expect(page.locator('aside[aria-label="Household book details"]')).toHaveCount(0)
  releaseHousehold()
  await expect(page.getByText(/couldn’t load the household library/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Personal' })).toBeVisible()
  await expect(page.locator('aside[aria-label="Household book details"]')).toHaveCount(0)
  await page.unroute(rosterPattern)
})

test('two linked personal libraries appear together without exposing personal controls', async ({
  page,
}, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile'
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
  await expect(page.locator('aside[aria-label="Household book details"]')).toHaveCount(0)

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
  await expect(page.locator('aside[aria-label="Household book details"]')).toHaveCount(0)

  seeded = await seedDuplicateBooks()

  // Inspect the authenticated RPC payload itself, not only the rendered surface. Household
  // tags/tropes must cross the boundary; private notes/moods and reading fields must not.
  const ownerClient = createClient(SUPABASE_URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  await ownerClient.auth.setSession(owner.session)
  const sharedPayload = await ownerClient.rpc('household_library_works')
  if (sharedPayload.error) throw sharedPayload.error
  expect(sharedPayload.data).toHaveLength(1)
  for (const row of sharedPayload.data ?? []) {
    expect(row).not.toHaveProperty('notes')
    expect(row).not.toHaveProperty('moods')
    expect(row).not.toHaveProperty('rating')
    expect(row).not.toHaveProperty('read_status')
  }
  const serializedPayload = JSON.stringify(sharedPayload.data)
  expect(serializedPayload).toContain(seeded.sentinels.tag)
  expect(serializedPayload).toContain(seeded.sentinels.trope)
  expect(serializedPayload).not.toContain(seeded.sentinels.note)
  expect(serializedPayload).not.toContain(seeded.sentinels.mood)

  await page.reload()

  await expect(page.getByRole('button', { name: 'Household' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByTestId('household-book-card')).toHaveCount(1)

  const ownerCard = page.locator(`[data-owners~="${owner.uid}"]`)
  const memberCard = page.locator(`[data-owners~="${member.uid}"]`)
  await expect(ownerCard).toContainText(`${owner.displayName} (you)`)
  await expect(memberCard).toContainText(member.displayName)
  await expect(ownerCard).toContainText(`Household Duplicate ${projectName}`)
  await expect(page.getByText(seeded.sentinels.note, { exact: false })).toHaveCount(0)
  await expect(page.getByText(seeded.sentinels.mood, { exact: false })).toHaveCount(0)

  if (isMobile) {
    expect(
      await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      })),
    ).toEqual({ client: 390, scroll: 390 })

    const initialScrollY = await page.evaluate(() => window.scrollY)
    await memberCard.focus()
    await memberCard.click()
    const detail = page.getByRole('dialog', { name: /household details/i })
    const close = detail.getByRole('button', { name: 'Close household details' })
    await expect(detail).toHaveJSProperty('open', true)
    expect(await detail.evaluate((dialog) => dialog.matches(':modal'))).toBe(true)
    await expect(close).toBeFocused()
    await expect(detail).toContainText(
      `Active copies: ${owner.displayName} (you), ${member.displayName}`,
    )
    await expect(detail).toContainText(seeded.sentinels.tag)
    await expect(
      detail.getByRole('button', { name: /favourite|favorite|cover|shelf|edit/i }),
    ).toHaveCount(0)
    await expect(detail.getByRole('link')).toHaveCount(0)
    await expect(detail.getByText(seeded.sentinels.note, { exact: false })).toHaveCount(0)
    await expect(detail.getByText(seeded.sentinels.mood, { exact: false })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden')
    expect(
      await page.evaluate(() => {
        const top = document.elementFromPoint(window.innerWidth - 8, window.innerHeight - 8)
        return !!top?.closest('dialog[data-drawer-dialog]')
      }),
    ).toBe(true)
    const backgroundBlocked = await page
      .getByRole('button', { name: 'Personal' })
      .click({ trial: true, timeout: 500 })
      .then(
        () => false,
        () => true,
      )
    expect(backgroundBlocked).toBe(true)
    await page.keyboard.press('Tab')
    expect(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest('dialog[data-drawer-dialog]')),
      ),
    ).toBe(true)
    await page.keyboard.press('Shift+Tab')
    expect(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest('dialog[data-drawer-dialog]')),
      ),
    ).toBe(true)
    await page.keyboard.press('Escape')
    await expect(detail).toHaveCount(0)
    await expect(memberCard).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('')
    expect(await page.evaluate(() => window.scrollY)).toBe(initialScrollY)

    // Backdrop dismissal and repeated cycles must not leave listeners, focus, or scroll locks behind.
    await memberCard.click()
    await page.mouse.click(4, Math.floor((page.viewportSize()?.height ?? 844) / 2))
    await expect(detail).toHaveCount(0)
    await expect(memberCard).toBeFocused()

    // Repeated open/close cycles must not accumulate Escape listeners or retain the scroll lock.
    await memberCard.click()
    await expect(detail).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(detail).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('')
  } else {
    expect(await page.evaluate(() => document.documentElement.clientWidth)).toBeGreaterThanOrEqual(
      1280,
    )
    const rail = page.locator('aside[aria-label="Household book details"]')
    await expect(rail).toBeVisible()
    await memberCard.click()
    await expect(rail).toContainText(
      `Active copies: ${owner.displayName} (you), ${member.displayName}`,
    )
    await expect(rail).toContainText(seeded.sentinels.tag)
    await expect(rail.getByText(seeded.sentinels.note, { exact: false })).toHaveCount(0)
    await expect(rail.getByText(seeded.sentinels.mood, { exact: false })).toHaveCount(0)

    await page.setViewportSize({ width: 1279, height: 844 })
    const detail = page.getByRole('dialog', { name: /household details/i })
    await expect(rail).toHaveCount(0)
    await expect(detail).toBeVisible()
    await detail.getByRole('button', { name: 'Close household details' }).click()
    await page.setViewportSize({ width: 1280, height: 844 })
    await expect(page.locator('aside[aria-label="Household book details"]')).toBeVisible()
  }
  await expect(page).toHaveURL(/\/library\?scope=household$/)
})

test('the second reader gets the same household view with their own identity marked', async ({
  page,
}, testInfo) => {
  await signIn(page, member.session)
  await page.goto('/library?scope=household')

  await expect(page.locator(`[data-owners~="${member.uid}"]`)).toContainText(
    `${member.displayName} (you)`,
  )
  await expect(page.locator(`[data-owners~="${owner.uid}"]`)).toContainText(owner.displayName)
  await page.locator(`[data-owners~="${member.uid}"]`).click()
  const detail =
    testInfo.project.name === 'mobile'
      ? page.getByRole('dialog', { name: /household details/i })
      : page.locator('aside[aria-label="Household book details"]')
  await expect(detail).toContainText(
    `Active copies: ${owner.displayName}, ${member.displayName} (you)`,
  )
  await expect(detail.getByRole('link')).toHaveCount(0)
  if (seeded) {
    await expect(detail).toContainText(seeded.sentinels.tag)
    await expect(detail.getByText(seeded.sentinels.note, { exact: false })).toHaveCount(0)
    await expect(detail.getByText(seeded.sentinels.mood, { exact: false })).toHaveCount(0)
  }
})

test('an already-open tab never repaints a revoked household while a replacement settles', async ({
  page,
}) => {
  await signIn(page, owner.session)
  await page.goto('/library?scope=household')
  await expect(page.locator(`[data-owners~="${member.uid}"]`)).toBeVisible()
  const oldHouseholdId = householdId
  const oldHouseholdName = `Household Library ${projectName}`

  // Leaving household scope must evict its authorization-sensitive in-memory queries.
  await page.getByRole('button', { name: 'Personal', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Personal', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  replacement = await account('replacement', `Casey ${projectName}`)
  await okData(
    admin.rpc('unlink_household_member', {
      p_user: owner.uid,
      p_household: oldHouseholdId,
    }),
    'household-library owner external unlink',
  )
  householdId = await okData(
    admin.rpc('link_household', {
      p_name: `Replacement Household ${projectName}`,
      p_owner: owner.uid,
      p_members: [replacement.uid],
    }),
    'household-library replacement link',
  )
  replacementBookId = (
    await okData(
      admin
        .from('books')
        .insert({
          owner_id: replacement.uid,
          title: `Replacement Household Book ${projectName}`,
          author_first: 'Casey',
          author_last: 'Fixture',
          authors_display: 'Casey Fixture',
          status: 'standalone',
          ownership: 'owned',
        })
        .select('id')
        .single(),
      'household-library replacement book insert',
    )
  ).id

  let releaseRoster!: () => void
  const rosterGate = new Promise<void>((resolve) => {
    releaseRoster = resolve
  })
  let releaseBooks!: () => void
  const booksGate = new Promise<void>((resolve) => {
    releaseBooks = resolve
  })
  let markBooksRequested!: () => void
  const booksRequested = new Promise<void>((resolve) => {
    markBooksRequested = resolve
  })
  const rosterPattern = '**/rest/v1/rpc/household_roster'
  const booksPattern = '**/rest/v1/rpc/household_library_works'
  await page.route(rosterPattern, async (route) => {
    await rosterGate
    await route.continue()
  })
  await page.route(booksPattern, async (route) => {
    markBooksRequested()
    await booksGate
    await route.continue()
  })

  await page.getByRole('button', { name: 'Household', exact: true }).click()
  await expect(page.getByText('Loading the household library…')).toBeVisible()
  await expect(page.locator(`[data-owners~="${member.uid}"]`)).toHaveCount(0)
  await expect(page.getByText(oldHouseholdName, { exact: true })).toHaveCount(0)

  releaseRoster()
  await booksRequested
  await expect(page.getByText('Loading the household library…')).toBeVisible()
  await expect(page.locator(`[data-owners~="${member.uid}"]`)).toHaveCount(0)
  releaseBooks()

  await expect(
    page.getByText(`Replacement Household ${projectName}`, { exact: true }),
  ).toBeVisible()
  await expect(page.locator(`[data-owners~="${replacement.uid}"]`)).toContainText(
    replacement.displayName,
  )
  await expect(page.locator(`[data-owners~="${member.uid}"]`)).toHaveCount(0)
  await expect(page.getByText(oldHouseholdName, { exact: true })).toHaveCount(0)
  await page.unroute(rosterPattern)
  await page.unroute(booksPattern)
})

test('removing the replacement account leaves a read-only one-member household', async ({
  page,
}) => {
  if (!replacement) throw new Error('household-library replacement account was not created')
  await okData(
    admin.rpc('unlink_household_member', {
      p_user: replacement.uid,
      p_household: householdId,
    }),
    'household-library replacement unlink',
  )

  const preservedAccount = await admin.auth.admin.getUserById(replacement.uid)
  if (preservedAccount.error || !preservedAccount.data.user) {
    throw new Error('household-library unlink deleted the replacement account')
  }
  const preservedBooks = await ok(
    admin.from('books').select('id').eq('owner_id', replacement.uid),
    'household-library preserved replacement books',
  )
  expect(preservedBooks?.map((book) => book.id)).toContain(replacementBookId)

  await signIn(page, owner.session)
  await page.goto('/library?scope=household')

  await expect(page.getByText(/only household member left/i)).toBeVisible()
  await expect(page.getByTestId('household-book-card')).toHaveCount(2)
  await expect(page.locator(`[data-owners~="${owner.uid}"]`)).toContainText(
    `${owner.displayName} (you)`,
  )
  await expect(page.locator(`[data-owners~="${replacement.uid}"]`)).toHaveCount(0)
  await expect(page.locator(`[data-owners~="${member.uid}"]`)).toHaveCount(0)
  await expect(
    page
      .getByTestId('household-book-card')
      .filter({ hasText: `Replacement Household Book ${projectName}` }),
  ).toBeVisible()
})
