// Owner-run, dry-run-first reconciliation for the private chism-books-library.csv.
// Title-level plans and rollback data are written only to a caller-supplied directory OUTSIDE Git.
// The write is one service-role RPC transaction after an exact dry run has no unresolved identity.
//
//   pnpm household:reconcile -- chism-books-library.csv \
//     --account-a-id=<TC account> --account-b-id=<GC account> \
//     --artifact-dir=/private/path/reverie-reconciliation
//
//   pnpm household:reconcile -- chism-books-library.csv \
//     --account-a-id=<TC account> --account-b-id=<GC account> \
//     --artifact-dir=/private/path/reverie-reconciliation \
//     --write --confirm=RECONCILE_CHISM_HOUSEHOLD

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { USER_OWNED_TABLES } from '../apps/web/src/data/ownedTables.ts'
import { parseCsv, toRecords, normalizeRecord } from './corpus-import-lib.ts'
import {
  householdReconciliationCounts,
  pageQuery,
  planHouseholdReconciliation,
  RECONCILIATION_BACKUP_PRIMARY_KEYS,
  RECONCILIATION_HOUSEHOLD_BACKUP_SPECS,
} from './household-reconciliation-lib.ts'

const LOCAL_URL = 'http://127.0.0.1:55321'
const LOCAL_SERVICE_ROLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const args = process.argv.slice(2).filter((arg) => arg !== '--')
const value = (name) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? ''
const csvPath = args.find((arg) => !arg.startsWith('--'))
const accountA = value('account-a-id').trim().toLowerCase()
const accountB = value('account-b-id').trim().toLowerCase()
const artifactDir = resolve(value('artifact-dir'))
const write = args.includes('--write')
const confirm = value('confirm')

if (!csvPath) throw new Error('pass the private CSV path')
if (!UUID.test(accountA) || !UUID.test(accountB) || accountA === accountB) {
  throw new Error('pass two distinct valid --account-a-id and --account-b-id UUIDs')
}
if (!value('artifact-dir')) throw new Error('pass --artifact-dir outside the repository')
const repo = resolve(process.cwd())
const artifactRelative = relative(repo, artifactDir)
if (!artifactRelative.startsWith('..') || artifactRelative === '') {
  throw new Error('artifact directory must be outside the repository')
}
if (write && confirm !== 'RECONCILE_CHISM_HOUSEHOLD') {
  throw new Error('write requires --confirm=RECONCILE_CHISM_HOUSEHOLD after dry-run approval')
}

const hasUrl = !!process.env.SUPABASE_URL
const hasService = !!process.env.SUPABASE_SERVICE_ROLE_KEY
if (hasUrl !== hasService) throw new Error('set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
const url = process.env.SUPABASE_URL ?? LOCAL_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL_SERVICE_ROLE
const supabase = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const dbError = (action, error) =>
  new Error(`${action}: ${error?.message ?? JSON.stringify(error)}`)

const fetchWorks = () =>
  pageQuery('works lookup', ['id'], (from, to) =>
    supabase
      .from('works')
      .select('id, title, author_text', { count: 'exact' })
      .order('id')
      .range(from, to),
  )

const fetchBooks = () =>
  pageQuery('account books', ['id'], (from, to) =>
    supabase
      .from('books')
      .select('id, owner_id, corpus_work_id, removed_at', { count: 'exact' })
      .in('owner_id', [accountA, accountB])
      .order('owner_id')
      .order('id')
      .range(from, to),
  )

const fetchHouseholdWorks = (householdId) =>
  pageQuery('household works', ['work_id'], (from, to) =>
    supabase
      .from('household_works')
      .select('work_id, removed_at', { count: 'exact' })
      .eq('household_id', householdId)
      .order('work_id')
      .range(from, to),
  )

function writePrivateJson(name, value) {
  mkdirSync(artifactDir, { recursive: true, mode: 0o700 })
  const body = `${JSON.stringify(value, null, 2)}\n`
  const path = resolve(artifactDir, name)
  writeFileSync(path, body, { mode: 0o600 })
  return { path, sha256: createHash('sha256').update(body).digest('hex') }
}

async function resolveHousehold() {
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', [accountA, accountB])
  if (profileError) throw dbError('profile lookup', profileError)
  if ((profiles ?? []).length !== 2) throw new Error('both requested profiles must exist')
  const { data: memberships, error: membershipError } = await supabase
    .from('household_members')
    .select('household_id, user_id, role')
    .in('user_id', [accountA, accountB])
  if (membershipError) throw dbError('household membership lookup', membershipError)
  const ids = [...new Set((memberships ?? []).map((row) => row.household_id))]
  if (ids.length !== 1 || (memberships ?? []).length !== 2) {
    throw new Error('both accounts must be members of the same one household')
  }
  return { householdId: ids[0], profiles, memberships }
}

async function backupOwnerState(householdId) {
  const tables = {}
  for (const entry of USER_OWNED_TABLES) {
    const primaryKey = RECONCILIATION_BACKUP_PRIMARY_KEYS[entry.table]
    if (!primaryKey?.length) {
      throw new Error(`backup ${entry.table}: no stable primary-key ordering is declared`)
    }
    const rows = await pageQuery(`backup ${entry.table}`, primaryKey, (from, to) => {
      let query = supabase
        .from(entry.table)
        .select('*', { count: 'exact' })
        .in(entry.owner, [accountA, accountB])
        .order(entry.owner)
      for (const column of primaryKey) query = query.order(column)
      return query.range(from, to)
    })
    tables[entry.table] = rows
  }
  const householdEntries = await Promise.all(
    RECONCILIATION_HOUSEHOLD_BACKUP_SPECS.map(async (entry) => {
      const rows = await pageQuery(
        `backup household ${entry.key}`,
        entry.primaryKey,
        (from, to) => {
          let query = supabase
            .from(entry.table)
            .select('*', { count: 'exact' })
            .eq(entry.table === 'households' ? 'id' : 'household_id', householdId)
          for (const column of entry.primaryKey) query = query.order(column)
          return query.range(from, to)
        },
      )
      return [entry.key, rows]
    }),
  )
  const household = Object.fromEntries(householdEntries)
  const { count: corpusCount, error: countError } = await supabase
    .from('works')
    .select('id', { count: 'exact', head: true })
  if (countError) throw dbError('corpus count', countError)
  return {
    createdAt: new Date().toISOString(),
    endpoint: url,
    accounts: [accountA, accountB],
    householdId,
    corpusCount,
    ownerTables: tables,
    household,
  }
}

async function currentPlan(records, householdId) {
  const [works, books, householdWorks] = await Promise.all([
    fetchWorks(),
    fetchBooks(),
    fetchHouseholdWorks(householdId),
  ])
  return {
    plan: planHouseholdReconciliation({
      records,
      works,
      books,
      householdWorks,
      accountA,
      accountB,
    }),
    corpusCount: works.length,
  }
}

async function main() {
  const records = toRecords(parseCsv(readFileSync(csvPath, 'utf8'))).map(normalizeRecord)
  const { householdId, profiles, memberships } = await resolveHousehold()
  const { plan, corpusCount } = await currentPlan(records, householdId)
  const counts = householdReconciliationCounts(plan)
  const detail = writePrivateJson('dry-run-detail.json', {
    createdAt: new Date().toISOString(),
    endpoint: url,
    householdId,
    accounts: { accountA, accountB },
    plan,
  })
  console.log(
    JSON.stringify(
      {
        mode: write ? 'WRITE' : 'DRY RUN — nothing written',
        endpoint: url,
        accounts: profiles,
        householdId,
        roster: memberships,
        corpusCount,
        counts,
        canWrite: plan.canWrite,
        privateDetailArtifact: detail,
      },
      null,
      2,
    ),
  )
  if (!plan.canWrite) {
    throw new Error('write blocked: resolve every unmatched, ambiguous, or duplicate-active row')
  }
  if (!write) {
    console.log('\nDry run complete. Review the private artifact and checksum before any write.')
    return
  }

  const backup = writePrivateJson(
    `prechange-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    await backupOwnerState(householdId),
  )
  console.log(JSON.stringify({ verifiedPrechangeBackup: backup }, null, 2))

  const desiredA = [
    ...new Set(plan.resolved.filter((item) => item.record.tcRead).map((item) => item.workId)),
  ].sort()
  const desiredB = [
    ...new Set(plan.resolved.filter((item) => item.record.gcRead).map((item) => item.workId)),
  ].sort()
  const desiredHousehold = [...new Set(plan.resolved.map((item) => item.workId))].sort()
  const { data: result, error } = await supabase.rpc('reconcile_household_library_memberships', {
    p_household: householdId,
    p_personal_assignments: [
      { accountId: accountA, workIds: desiredA },
      { accountId: accountB, workIds: desiredB },
    ],
    p_household_work_ids: desiredHousehold,
  })
  if (error) throw dbError('atomic reconciliation', error)

  const post = await currentPlan(records, householdId)
  const postCounts = householdReconciliationCounts(post.plan)
  if (
    !post.plan.canWrite ||
    postCounts.personalCreate ||
    postCounts.personalRestore ||
    postCounts.personalArchive ||
    postCounts.householdCreate ||
    postCounts.householdRestore ||
    postCounts.householdArchive ||
    post.corpusCount !== corpusCount
  ) {
    throw new Error('post-write verification did not converge exactly to the approved plan')
  }
  const verified = writePrivateJson('postchange-verification.json', {
    createdAt: new Date().toISOString(),
    rpcResult: result,
    corpusCountBefore: corpusCount,
    corpusCountAfter: post.corpusCount,
    counts: postCounts,
  })
  console.log(
    JSON.stringify({ result, postCounts, privateVerificationArtifact: verified }, null, 2),
  )
}

main().catch((error) => {
  console.error(
    `reconcile-chism-household: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exitCode = 1
})
