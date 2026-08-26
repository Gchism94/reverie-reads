// Deterministic local two-session regression for concurrent final household unlinks.
// Both real RPC calls run in explicit transactions behind a controller-owned commit barrier. The
// harness observes pg_locks before releasing either transaction: the fixed implementation has one
// worker at the barrier and one serialized on the household row, while the old implementation has
// both workers at the barrier after independently evaluating cleanup. No elapsed-time delay decides
// whether the race was reached.

import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
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
const fixtureUserIds = []
let householdId = null

// Two-key advisory locks make the controller barrier easy to identify exactly in pg_locks.
const BARRIER_CLASS = 1_608_202_608
const BARRIER_ID = 1

const sqlScalar = (statement) =>
  execFileSync('psql', [DATABASE_URL, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', statement], {
    stdio: 'pipe',
    encoding: 'utf8',
  }).trim()

const yieldTurn = () => new Promise((resolve) => setImmediate(resolve))

class PsqlSession {
  constructor(name) {
    this.name = name
    this.sequence = 0
    this.buffer = ''
    this.stderr = ''
    this.pending = null
    this.process = spawn('psql', [DATABASE_URL, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.process.stdout.setEncoding('utf8')
    this.process.stderr.setEncoding('utf8')
    this.process.stdout.on('data', (chunk) => this.#consume(chunk))
    this.process.stderr.on('data', (chunk) => {
      this.stderr += chunk
    })
    this.process.on('error', (error) => this.#reject(error))
    this.process.on('exit', (code) => {
      if (this.pending) {
        this.#reject(new Error(`${this.name} psql exited ${code}: ${this.stderr.trim()}`))
      }
    })
  }

  #consume(chunk) {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!this.pending) continue
      if (line === this.pending.sentinel) {
        const { resolve, output } = this.pending
        this.pending = null
        resolve(output.join('\n').trim())
      } else {
        this.pending.output.push(line)
      }
    }
  }

  #reject(error) {
    if (!this.pending) return
    const { reject } = this.pending
    this.pending = null
    reject(error)
  }

  command(statement) {
    assert.equal(this.pending, null, `${this.name} already has a command in flight`)
    const sentinel = `__reverie_${this.name}_${this.sequence++}_${randomUUID()}__`
    return new Promise((resolve, reject) => {
      this.pending = { sentinel, output: [], resolve, reject }
      this.process.stdin.write(`${statement}\n\\echo ${sentinel}\n`)
    })
  }

  async close() {
    if (this.process.exitCode !== null) return
    const exited = once(this.process, 'exit')
    this.process.stdin.end()
    await exited
  }
}

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

async function waitForConcurrentState(workerPids) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const [barrierWaiters, waitingWorkers] = sqlScalar(`
      select
        count(*) filter (
          where not granted
            and locktype = 'advisory'
            and classid = ${BARRIER_CLASS}
            and objid = ${BARRIER_ID}
            and mode = 'ShareLock'
        ),
        count(distinct pid) filter (where not granted)
      from pg_catalog.pg_locks
      where pid in (${workerPids.join(', ')});
    `)
      .split('|')
      .map(Number)

    // Fixed: the first RPC completed behind the barrier; the second worker is waiting on the
    // household row. Old: both RPCs completed behind the barrier without serializing cleanup.
    if (barrierWaiters === 2 || (barrierWaiters === 1 && waitingWorkers === 2)) {
      return { barrierWaiters, waitingWorkers }
    }
    await yieldTurn()
  }
  throw new Error('timed out waiting for both unlink transactions to reach a proven lock state')
}

async function waitForBlockedWorker(workerPid, action) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const blocked = Number(
      sqlScalar(`
        select count(*) from pg_catalog.pg_locks
        where pid = ${workerPid} and not granted;
      `),
    )
    if (blocked > 0) return
    await yieldTurn()
  }
  throw new Error(`timed out waiting for ${action} to block behind the revocation lock`)
}

const authenticatedCall = (userId, statement) => `
  begin;
  set local role authenticated;
  select set_config(
    'request.jwt.claims',
    '{"sub":"${userId}","role":"authenticated"}',
    true
  );
  do $race$
  declare
    rejected boolean := false;
  begin
    begin
      ${statement};
    exception when sqlstate '40001' then
      rejected := true;
    end;
    if not rejected then
      raise exception 'expected serialization refusal after concurrent membership revocation';
    end if;
  end;
  $race$;
  commit;
  select 'rejected-after-serialization';
`

async function runRevocationRace({ action, userId, statement, verify }) {
  const revoker = new PsqlSession(`${action}-revoker`)
  const worker = new PsqlSession(`${action}-worker`)
  let workerResult = null
  let revocationOpen = false
  try {
    const workerPid = Number(await worker.command('select pg_backend_pid();'))
    assert.ok(Number.isInteger(workerPid), `${action} worker exposes a stable PID`)

    await revoker.command(`
      begin;
      set local role service_role;
      select public.unlink_household_member('${userId}'::uuid, '${householdId}'::uuid);
      reset role;
      select 'revoked-but-uncommitted';
    `)
    revocationOpen = true

    workerResult = worker.command(authenticatedCall(userId, statement))
    await waitForBlockedWorker(workerPid, action)
    await revoker.command('commit;')
    revocationOpen = false
    assert.match(await workerResult, /rejected-after-serialization/, `${action} rejects stale auth`)
    await verify()
    console.log(`✓ ${action} rechecks authorization after its serialization lock`)
  } finally {
    if (revocationOpen) await revoker.command('rollback;').catch(() => {})
    await Promise.allSettled([workerResult, worker.close(), revoker.close()])
  }
}

async function relinkMember(ownerId, memberId) {
  const linked = await admin.rpc('link_household', {
    p_name: 'Concurrent final unlink fixture',
    p_owner: ownerId,
    p_members: [memberId],
  })
  if (linked.error || linked.data !== householdId) {
    throw dbError('fixture member relink', linked.error)
  }
}

async function exerciseAuthorizationRevocations({
  ownerId,
  memberId,
  ownerBookId,
  borrowedBookId,
}) {
  const ownerWorkId = sqlScalar(
    `select corpus_work_id from public.books where id = '${ownerBookId}'::uuid;`,
  )
  const borrowedWorkId = sqlScalar(
    `select corpus_work_id from public.books where id = '${borrowedBookId}'::uuid;`,
  )

  await runRevocationRace({
    action: 'add-personal-book',
    userId: memberId,
    statement: `perform public.add_personal_book_to_household('${borrowedBookId}'::uuid)`,
    verify: async () => {
      assert.equal(
        sqlScalar(
          `select count(*) from public.household_book_shares
           where book_id = '${borrowedBookId}'::uuid and removed_at is null;`,
        ),
        '0',
        'revoked add creates no borrowed share',
      )
    },
  })
  await relinkMember(ownerId, memberId)

  sqlScalar(`
    begin;
    set local role authenticated;
    select set_config(
      'request.jwt.claims',
      '{"sub":"${memberId}","role":"authenticated"}',
      true
    );
    select public.add_personal_book_to_household('${borrowedBookId}'::uuid);
    commit;
  `)

  await runRevocationRace({
    action: 'remove-personal-share',
    userId: memberId,
    statement: `perform public.remove_personal_book_from_household('${borrowedBookId}'::uuid)`,
    verify: async () => {
      assert.equal(
        sqlScalar(
          `select count(*) from public.household_book_shares
           where book_id = '${borrowedBookId}'::uuid and removed_at is null;`,
        ),
        '1',
        'revoked share removal leaves the prior share active',
      )
    },
  })
  await relinkMember(ownerId, memberId)

  await runRevocationRace({
    action: 'remove-household-work',
    userId: memberId,
    statement: `perform public.remove_household_work('${borrowedWorkId}'::uuid)`,
    verify: async () => {
      assert.equal(
        sqlScalar(
          `select count(*) from public.household_works
           where household_id = '${householdId}'::uuid and work_id = '${borrowedWorkId}'::uuid
             and removed_at is null;`,
        ),
        '1',
        'revoked household removal leaves membership active',
      )
    },
  })
  await relinkMember(ownerId, memberId)

  await runRevocationRace({
    action: 'update-household-enrichment',
    userId: memberId,
    statement: `perform public.update_household_work_enrichment(
      '${ownerWorkId}'::uuid, array['unauthorized-race'], '[]'::jsonb
    )`,
    verify: async () => {
      assert.equal(
        sqlScalar(
          `select count(*) from public.household_work_enrichment
           where household_id = '${householdId}'::uuid and work_id = '${ownerWorkId}'::uuid
             and 'unauthorized-race' = any(tags);`,
        ),
        '0',
        'revoked enrichment update writes no household annotation',
      )
    },
  })
  await relinkMember(ownerId, memberId)

  await runRevocationRace({
    action: 'update-corpus-metadata',
    userId: memberId,
    statement: `perform public.update_corpus_work_metadata(
      '${ownerWorkId}'::uuid,
      'unauthorized-race', null, array['unauthorized-race'], '{}', null, '[]'::jsonb
    )`,
    verify: async () => {
      assert.equal(
        sqlScalar(
          `select count(*) from public.works
           where id = '${ownerWorkId}'::uuid and genre = 'unauthorized-race';`,
        ),
        '0',
        'revoked corpus update changes no global metadata',
      )
    },
  })
  await relinkMember(ownerId, memberId)
}

const unlinkTransaction = (session, userId, reviewedHouseholdId) =>
  session.command(`
    begin;
    set local role service_role;
    select public.unlink_household_member('${userId}'::uuid, '${reviewedHouseholdId}'::uuid);
    reset role;
    select pg_catalog.pg_advisory_xact_lock_shared(${BARRIER_CLASS}, ${BARRIER_ID});
    commit;
  `)

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

  const ownerBookId = sqlScalar(
    `select id from public.books where owner_id = '${firstUserId}'::uuid order by id limit 1;`,
  )
  const borrowed = await admin
    .from('books')
    .insert({
      owner_id: secondUserId,
      title: 'Concurrent borrowed authorization fixture',
      author_first: 'Local',
      author_last: 'Borrower',
      authors_display: 'Local Borrower',
      status: 'standalone',
      ownership: 'unowned',
      borrowed: true,
    })
    .select('id')
    .single()
  if (borrowed.error || !borrowed.data)
    throw dbError('borrowed race fixture insert', borrowed.error)

  await exerciseAuthorizationRevocations({
    ownerId: firstUserId,
    memberId: secondUserId,
    ownerBookId,
    borrowedBookId: borrowed.data.id,
  })

  const controller = new PsqlSession('controller')
  const workers = [new PsqlSession('first'), new PsqlSession('second')]
  let unlinkResults = []
  let barrierHeld = false
  try {
    await controller.command(`select pg_catalog.pg_advisory_lock(${BARRIER_CLASS}, ${BARRIER_ID});`)
    barrierHeld = true
    const workerPids = await Promise.all(
      workers.map(async (worker) => Number(await worker.command('select pg_backend_pid();'))),
    )
    assert.ok(workerPids.every(Number.isInteger), 'worker database sessions expose stable PIDs')

    unlinkResults = [
      unlinkTransaction(workers[0], firstUserId, householdId),
      unlinkTransaction(workers[1], secondUserId, householdId),
    ]
    const concurrentState = await waitForConcurrentState(workerPids)

    await controller.command(
      `select pg_catalog.pg_advisory_unlock(${BARRIER_CLASS}, ${BARRIER_ID});`,
    )
    barrierHeld = false
    const outputs = await Promise.all(unlinkResults)
    assert.equal(
      concurrentState.barrierWaiters,
      1,
      'the household row serializes the second RPC before final-member cleanup',
    )
    for (const [index, output] of outputs.entries()) {
      assert.match(
        output,
        new RegExp(householdId),
        `concurrent unlink ${index + 1} returned household`,
      )
    }
  } finally {
    if (barrierHeld) {
      try {
        await controller.command(
          `select pg_catalog.pg_advisory_unlock(${BARRIER_CLASS}, ${BARRIER_ID});`,
        )
      } catch (error) {
        console.error(`barrier cleanup failed: ${String(error)}`)
      }
    }
    await Promise.allSettled(unlinkResults)
    await Promise.allSettled([...workers.map((worker) => worker.close()), controller.close()])
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
  assert.equal(books.data?.length, 3, 'both owned books and the borrowed fixture remain')
  console.log(
    '✓ concurrent final unlinks preserve both accounts/libraries and delete the household',
  )
}

try {
  await main()
} finally {
  if (householdId) {
    await admin.from('households').delete().eq('id', householdId)
  }
  for (const userId of fixtureUserIds) {
    await admin.auth.admin.deleteUser(userId)
  }
}
