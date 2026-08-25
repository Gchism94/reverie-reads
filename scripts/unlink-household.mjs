// unlink-household.mjs — owner-run membership-only household removal.
//
// DRY RUN (default; writes nothing):
//   pnpm household:unlink -- --user-id=<account-uuid>
//
// Review the endpoint, household name, complete current roster, and departing account, then repeat
// with --write. The account, profile, and personal books are never deleted by this operation.

import { createClient } from '@supabase/supabase-js'
import { parseHouseholdUnlinkArgs, verifyHouseholdUnlink } from './household-link-lib.ts'

const LOCAL_URL = 'http://127.0.0.1:55321'
const LOCAL_SERVICE_ROLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const dbError = (action, error) =>
  new Error(`${action}: ${error?.message ?? JSON.stringify(error)}`)

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--')
  const write = args.includes('--write')
  const { userId } = parseHouseholdUnlinkArgs(args)
  const hasUrl = !!process.env.SUPABASE_URL
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY
  if (hasUrl !== hasServiceRole) {
    throw new Error('set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or neither for local')
  }
  const url = process.env.SUPABASE_URL ?? LOCAL_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL_SERVICE_ROLE
  const supabase = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const [profileResult, membershipResult] = await Promise.all([
    supabase.from('profiles').select('id, display_name').eq('id', userId).maybeSingle(),
    supabase
      .from('household_members')
      .select('household_id, user_id, role')
      .eq('user_id', userId)
      .maybeSingle(),
  ])
  if (profileResult.error) throw dbError('profile lookup failed', profileResult.error)
  if (membershipResult.error) throw dbError('membership lookup failed', membershipResult.error)
  if (!profileResult.data) throw new Error(`no profile for: ${userId}`)
  if (!membershipResult.data) throw new Error(`account is not linked to a household: ${userId}`)

  const householdId = membershipResult.data.household_id
  const [householdResult, rosterResult] = await Promise.all([
    supabase.from('households').select('id, name').eq('id', householdId).single(),
    supabase
      .from('household_members')
      .select('household_id, user_id, role')
      .eq('household_id', householdId),
  ])
  if (householdResult.error) throw dbError('household lookup failed', householdResult.error)
  if (rosterResult.error) throw dbError('complete roster lookup failed', rosterResult.error)
  const rosterIds = (rosterResult.data ?? []).map((membership) => membership.user_id)
  const { data: profiles, error: rosterProfileError } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', rosterIds)
  if (rosterProfileError) throw dbError('roster profile lookup failed', rosterProfileError)

  console.log(
    JSON.stringify(
      {
        mode: write ? 'WRITE' : 'DRY RUN — nothing written',
        endpoint: url,
        household: householdResult.data,
        removing: {
          id: userId,
          displayName: profileResult.data.display_name,
          role: membershipResult.data.role,
        },
        currentRoster: (rosterResult.data ?? []).map((membership) => ({
          ...membership,
          displayName:
            (profiles ?? []).find((profile) => profile.id === membership.user_id)?.display_name ??
            null,
        })),
        effect:
          'Removes this membership and mutual household-library access; preserves the account, profile, and personal books.',
      },
      null,
      2,
    ),
  )

  if (!write) {
    console.log('\nDry run complete. Review every affected account, then repeat with --write.')
    return
  }

  const { data: removedHouseholdId, error: unlinkError } = await supabase.rpc(
    'unlink_household_member',
    { p_user: userId, p_household: householdId },
  )
  if (unlinkError) throw dbError('household unlink failed', unlinkError)

  const [
    authResult,
    preservedProfileResult,
    removedMembershipResult,
    remainingRosterResult,
    reviewedHouseholdResult,
    bookResult,
  ] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    supabase.from('profiles').select('id').eq('id', userId).maybeSingle(),
    supabase
      .from('household_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from('household_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('household_id', householdId),
    supabase.from('households').select('id').eq('id', householdId).maybeSingle(),
    supabase.from('books').select('id', { count: 'exact', head: true }).eq('owner_id', userId),
  ])
  if (authResult.error || !authResult.data.user)
    throw dbError('authentication-account preservation check failed', authResult.error)
  if (preservedProfileResult.error || !preservedProfileResult.data)
    throw dbError('profile preservation check failed', preservedProfileResult.error)
  if (removedMembershipResult.error)
    throw dbError('membership removal check failed', removedMembershipResult.error)
  if (removedMembershipResult.count !== 0)
    throw new Error('membership removal check failed: the account is still linked')
  if (remainingRosterResult.error || remainingRosterResult.count === null)
    throw dbError('remaining household roster check failed', remainingRosterResult.error)
  if (reviewedHouseholdResult.error)
    throw dbError('reviewed household lifecycle check failed', reviewedHouseholdResult.error)
  if (bookResult.error) throw dbError('personal-book preservation check failed', bookResult.error)

  const householdState = verifyHouseholdUnlink({
    reviewedHouseholdId: householdId,
    returnedHouseholdId: removedHouseholdId,
    remainingMembershipCount: remainingRosterResult.count,
    householdExists: !!reviewedHouseholdResult.data,
  })
  console.log(
    `\nUnlinked ${userId} from household ${removedHouseholdId}. Household ${householdState}; account/profile preserved; ${bookResult.count ?? 0} personal book(s) remain.`,
  )
}

main().catch((error) => {
  console.error(`unlink-household: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
