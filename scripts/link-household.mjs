// link-household.mjs — owner-run household membership linker.
//
// DRY RUN (default; reads profiles/memberships, writes nothing):
//   pnpm household:link -- --name="Our household" \
//     --owner-id=<current-library-account-uuid> --member-id=<second-account-uuid>
//
// After reviewing the endpoint, account names, and existing memberships printed by the dry run,
// repeat with --write. Production requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY explicitly;
// without both, the script can target only the well-known local stack.
//
// The UUIDs are runtime arguments on purpose. Account linkage is production data, not schema, so
// IDs never belong in a migration or committed source file.

import { createClient } from '@supabase/supabase-js'
import { householdLinkPreview, parseHouseholdLinkArgs } from './household-link-lib.ts'

const LOCAL_URL = 'http://127.0.0.1:55321'
const LOCAL_SERVICE_ROLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const dbError = (action, error) =>
  new Error(`${action}: ${error?.message ?? JSON.stringify(error)}`)

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--')
  const write = args.includes('--write')
  const config = parseHouseholdLinkArgs(args)
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

  const [profileResult, requestedMembershipResult] = await Promise.all([
    supabase.from('profiles').select('id, display_name').in('id', config.allUserIds),
    supabase
      .from('household_members')
      .select('household_id, user_id, role')
      .in('user_id', config.allUserIds),
  ])
  const { data: profiles, error: profileError } = profileResult
  if (profileError) throw dbError('profile lookup failed', profileError)

  const found = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]))
  const missing = config.allUserIds.filter((id) => !found.has(id))
  if (missing.length) throw new Error(`no profile for: ${missing.join(', ')}`)

  const { data: requestedMemberships, error: membershipError } = requestedMembershipResult
  if (membershipError) throw dbError('membership lookup failed', membershipError)

  const implicatedIds = [
    ...new Set((requestedMemberships ?? []).map((membership) => membership.household_id)),
  ]
  const [householdResult, rosterResult] = implicatedIds.length
    ? await Promise.all([
        supabase.from('households').select('id, name').in('id', implicatedIds),
        supabase
          .from('household_members')
          .select('household_id, user_id, role')
          .in('household_id', implicatedIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ]
  if (householdResult.error) throw dbError('household lookup failed', householdResult.error)
  if (rosterResult.error) throw dbError('complete roster lookup failed', rosterResult.error)

  const rosterIds = [...new Set((rosterResult.data ?? []).map((membership) => membership.user_id))]
  const extraProfileIds = rosterIds.filter((id) => !found.has(id))
  let allProfiles = profiles ?? []
  if (extraProfileIds.length) {
    const { data: extraProfiles, error: extraProfileError } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', extraProfileIds)
    if (extraProfileError) throw dbError('existing member profile lookup failed', extraProfileError)
    allProfiles = [...allProfiles, ...(extraProfiles ?? [])]
  }

  const preview = householdLinkPreview(
    config,
    allProfiles,
    householdResult.data ?? [],
    rosterResult.data ?? [],
  )

  console.log(
    JSON.stringify(
      {
        mode: write ? 'WRITE' : 'DRY RUN — nothing written',
        endpoint: url,
        ...preview,
      },
      null,
      2,
    ),
  )

  if (!write) {
    console.log(
      preview.canWrite
        ? '\nDry run complete. Review every affected account, then repeat with --write.'
        : '\nDry run complete. WRITE IS BLOCKED until the request includes the complete existing roster and only one household.',
    )
    return
  }

  if (!preview.canWrite) {
    throw new Error(
      'write blocked: include every existing household member and do not span households',
    )
  }

  const { data: householdId, error: linkError } = await supabase.rpc('link_household', {
    p_name: config.name,
    p_owner: config.ownerId,
    p_members: config.memberIds,
  })
  if (linkError) throw dbError('household link failed', linkError)

  const [linkedHouseholdResult, linkedMembershipResult] = await Promise.all([
    supabase.from('households').select('id, name').eq('id', householdId).single(),
    supabase
      .from('household_members')
      .select('household_id, user_id, role')
      .eq('household_id', householdId),
  ])
  if (linkedHouseholdResult.error)
    throw dbError('linked household verification failed', linkedHouseholdResult.error)
  if (linkedMembershipResult.error)
    throw dbError('linked roster verification failed', linkedMembershipResult.error)
  const linkedIds = (linkedMembershipResult.data ?? []).map((membership) => membership.user_id)
  const { data: linkedProfiles, error: linkedProfileError } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', linkedIds)
  if (linkedProfileError) throw dbError('linked profile verification failed', linkedProfileError)

  console.log(
    `\nLinked household (authoritative post-write state):\n${JSON.stringify(
      {
        endpoint: url,
        household: linkedHouseholdResult.data,
        roster: (linkedMembershipResult.data ?? []).map((membership) => ({
          ...membership,
          displayName:
            (linkedProfiles ?? []).find((profile) => profile.id === membership.user_id)
              ?.display_name ?? null,
        })),
      },
      null,
      2,
    )}`,
  )
}

main().catch((error) => {
  console.error(`link-household: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
