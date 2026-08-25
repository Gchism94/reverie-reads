// Deterministic local two-session regression for concurrent final household unlinks.
// A test-only BEFORE DELETE delay makes both old transactions evaluate cleanup concurrently; the
// household-row lock in unlink_household_member serializes the fixed implementation before that
// point. The trigger and all fixtures are removed even when an assertion fails.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'http://127.0.0.1:55321'
const DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:55322/postgres'
const SERVICE_ROLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const client = () =>
  createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

const admin = client()
const firstSession = client()
const secondSession = client()
const fixtureUserIds = []
let householdId = null

const sql = (statement) =>
  execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-c', statement], {
    stdio: 'pipe',
    encoding: 'utf8',
  })

const dbError = (action, error) =>
  new Error(`${action}: ${error?.message ?? JSON.stringify(error)}`)

async function fixtureAccount(label) {
  const email = `household-unlink-${label}-${randomUUID()}@reverie.local`
  const created = await admin.auth.admin.createUser({
    email,
    password: `local-${randomUUID()}`,
    email_confirm: true,
  })
  if (created.error || !created.data.user) throw dbError(`${label} account create`, created.error)
  const userId = created.data.user.id
  fixtureUserIds.push(userId)

  const profile = await admin
    .from('profiles')
    .upsert({ id: userId, display_name: `Concurrent ${label}` })
  if (profile.error) throw dbError(`${label} profile upsert`, profile.error)
  const book = await admin.from('books').insert({
    owner_id: userId,
    title: `Preserved ${label} book`,
    author_first: 'Local',
    author_last: 'Fixture',
    authors_display: 'Local Fixture',
    status: 'standalone',
    ownership: 'owned',
  })
  if (book.error) throw dbError(`${label} book insert`, book.error)
  return userId
}

function installDelayTrigger() {
  sql(`
    drop trigger if exists __test_household_unlink_delay on public.household_members;
    drop function if exists public.__test_household_unlink_delay();
    create function public.__test_household_unlink_delay()
    returns trigger
    language plpgsql
    set search_path = ''
    as $$
    begin
      perform pg_catalog.pg_sleep(0.75);
      return old;
    end;
    $$;
    create trigger __test_household_unlink_delay
      before delete on public.household_members
      for each row execute function public.__test_household_unlink_delay();
  `)
}

function removeDelayTrigger() {
  sql(`
    drop trigger if exists __test_household_unlink_delay on public.household_members;
    drop function if exists public.__test_household_unlink_delay();
  `)
}

async function main() {
  const firstUserId = await fixtureAccount('first')
  const secondUserId = await fixtureAccount('second')
  const linked = await admin.rpc('link_household', {
    p_name: 'Concurrent final unlink fixture',
    p_owner: firstUserId,
    p_members: [secondUserId],
  })
  if (linked.error || !linked.data) throw dbError('fixture household link', linked.error)
  householdId = linked.data

  installDelayTrigger()
  const results = await Promise.all([
    firstSession.rpc('unlink_household_member', {
      p_user: firstUserId,
      p_household: householdId,
    }),
    secondSession.rpc('unlink_household_member', {
      p_user: secondUserId,
      p_household: householdId,
    }),
  ])
  for (const [index, result] of results.entries()) {
    if (result.error) throw dbError(`concurrent unlink ${index + 1}`, result.error)
    assert.equal(result.data, householdId, `concurrent unlink ${index + 1} returned household`)
  }

  const [memberships, household, profiles, books, firstAuth, secondAuth] = await Promise.all([
    admin
      .from('household_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('household_id', householdId),
    admin.from('households').select('id').eq('id', householdId).maybeSingle(),
    admin.from('profiles').select('id').in('id', fixtureUserIds),
    admin.from('books').select('owner_id').in('owner_id', fixtureUserIds),
    admin.auth.admin.getUserById(firstUserId),
    admin.auth.admin.getUserById(secondUserId),
  ])
  if (memberships.error) throw dbError('remaining memberships read', memberships.error)
  if (household.error) throw dbError('household lifecycle read', household.error)
  if (profiles.error) throw dbError('preserved profiles read', profiles.error)
  if (books.error) throw dbError('preserved books read', books.error)
  if (firstAuth.error || !firstAuth.data.user)
    throw dbError('first auth preservation', firstAuth.error)
  if (secondAuth.error || !secondAuth.data.user)
    throw dbError('second auth preservation', secondAuth.error)

  assert.equal(memberships.count, 0, 'both memberships are removed')
  assert.equal(household.data, null, 'the empty household is deleted')
  assert.equal(profiles.data?.length, 2, 'both profiles remain')
  assert.equal(books.data?.length, 2, 'both personal books remain')
  console.log(
    '✓ concurrent final unlinks preserve both accounts/libraries and delete the household',
  )
}

try {
  await main()
} finally {
  try {
    removeDelayTrigger()
  } catch (error) {
    console.error(`delay-trigger cleanup failed: ${String(error)}`)
  }
  if (householdId) {
    await admin.from('households').delete().eq('id', householdId)
  }
  for (const userId of fixtureUserIds) {
    await admin.auth.admin.deleteUser(userId)
  }
}
