// Owner-run corpus administrator grants. Dry-run is the default and writes nothing.
//
//   pnpm corpus:admins -- --user-id=<account-a> --user-id=<account-b>
//   pnpm corpus:admins -- --user-id=<account-a> --user-id=<account-b> \
//     --write --confirm=GRANT_CORPUS_ADMIN
//
// Production requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY explicitly. Account ids are
// runtime arguments rather than schema: authorization assignments are environment data and never
// belong in a migration.

import { createClient } from '@supabase/supabase-js'

const LOCAL_URL = 'http://127.0.0.1:55321'
const LOCAL_SERVICE_ROLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const args = process.argv.slice(2).filter((arg) => arg !== '--')
const ids = [
  ...new Set(
    args
      .filter((arg) => arg.startsWith('--user-id='))
      .map((arg) => arg.slice('--user-id='.length).trim().toLowerCase()),
  ),
]
const write = args.includes('--write')
const confirm = args.find((arg) => arg.startsWith('--confirm='))?.slice('--confirm='.length)

const hasUrl = !!process.env.SUPABASE_URL
const hasService = !!process.env.SUPABASE_SERVICE_ROLE_KEY
if (hasUrl !== hasService) throw new Error('set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
if (!ids.length || ids.some((id) => !UUID.test(id))) {
  throw new Error('pass one or more valid --user-id=<uuid> arguments')
}
if (write && confirm !== 'GRANT_CORPUS_ADMIN') {
  throw new Error('write requires --confirm=GRANT_CORPUS_ADMIN after reviewing the dry run')
}

const url = process.env.SUPABASE_URL ?? LOCAL_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL_SERVICE_ROLE
const supabase = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const dbError = (action, error) =>
  new Error(`${action}: ${error?.message ?? JSON.stringify(error)}`)

async function main() {
  const [profilesResult, grantsResult] = await Promise.all([
    supabase.from('profiles').select('id, display_name').in('id', ids),
    supabase.from('corpus_admins').select('user_id, granted_at').in('user_id', ids),
  ])
  if (profilesResult.error) throw dbError('profile lookup failed', profilesResult.error)
  if (grantsResult.error) throw dbError('admin lookup failed', grantsResult.error)
  const profiles = profilesResult.data ?? []
  const missing = ids.filter((id) => !profiles.some((profile) => profile.id === id))
  if (missing.length) throw new Error(`no profile for: ${missing.join(', ')}`)
  const current = new Set((grantsResult.data ?? []).map((grant) => grant.user_id))
  console.log(
    JSON.stringify(
      {
        mode: write ? 'WRITE' : 'DRY RUN — nothing written',
        endpoint: url,
        requestedAccounts: ids.map((id) => ({
          id,
          displayName: profiles.find((profile) => profile.id === id)?.display_name ?? null,
          currentRole: current.has(id) ? 'corpus_admin' : 'reader',
          proposedRole: 'corpus_admin',
        })),
        additions: ids.filter((id) => !current.has(id)).length,
        unchanged: ids.filter((id) => current.has(id)).length,
      },
      null,
      2,
    ),
  )
  if (!write) {
    console.log(
      '\nDry run complete. Review both accounts, then repeat with --write and confirmation.',
    )
    return
  }

  const { error } = await supabase.from('corpus_admins').upsert(
    ids.map((user_id) => ({ user_id })),
    {
      onConflict: 'user_id',
      ignoreDuplicates: true,
    },
  )
  if (error) throw dbError('admin grant failed', error)
  const { data: verified, error: verifyError } = await supabase
    .from('corpus_admins')
    .select('user_id, granted_at')
    .in('user_id', ids)
  if (verifyError) throw dbError('admin verification failed', verifyError)
  const verifiedIds = new Set((verified ?? []).map((grant) => grant.user_id))
  const absent = ids.filter((id) => !verifiedIds.has(id))
  if (absent.length)
    throw new Error(`post-write verification missing grants for: ${absent.join(', ')}`)
  console.log(`\nVerified ${verifiedIds.size} corpus administrator grant(s).`)
}

main().catch((error) => {
  console.error(`set-corpus-admins: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
