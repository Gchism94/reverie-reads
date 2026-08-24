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
import { parseHouseholdLinkArgs } from './household-link-lib.ts'

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

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', config.allUserIds)
  if (profileError) throw dbError('profile lookup failed', profileError)

  const found = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]))
  const missing = config.allUserIds.filter((id) => !found.has(id))
  if (missing.length) throw new Error(`no profile for: ${missing.join(', ')}`)

  const { data: memberships, error: membershipError } = await supabase
    .from('household_members')
    .select('household_id, user_id, role')
    .in('user_id', config.allUserIds)
  if (membershipError) throw dbError('membership lookup failed', membershipError)

  console.log(
    JSON.stringify(
      {
        mode: write ? 'WRITE' : 'DRY RUN — nothing written',
        endpoint: url,
        household: config.name,
        accounts: config.allUserIds.map((id) => ({
          id,
          displayName: found.get(id) ?? null,
          requestedRole: id === config.ownerId ? 'owner' : 'member',
        })),
        existingMemberships: memberships ?? [],
      },
      null,
      2,
    ),
  )

  if (!write) {
    console.log('\nDry run complete. Review the account identities, then repeat with --write.')
    return
  }

  const { data: householdId, error: linkError } = await supabase.rpc('link_household', {
    p_name: config.name,
    p_owner: config.ownerId,
    p_members: config.memberIds,
  })
  if (linkError) throw dbError('household link failed', linkError)

  console.log(`\nLinked ${config.allUserIds.length} accounts in household ${householdId}.`)
}

main().catch((error) => {
  console.error(`link-household: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
