import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  collapseHouseholdRecords,
  ensurePrivateArtifactDirectory,
  executePsql,
  pageQuery,
  planHouseholdReconciliation,
  psqlChildEnvironment,
  psqlConnectionBoundary,
  reconciliationRollbackScope,
  requireApprovedSha256,
} from '../../../scripts/household-reconciliation-lib'
import type { ImportRecord } from '../../../scripts/corpus-import-lib'

const record = (over: Partial<ImportRecord>): ImportRecord => ({
  title: 'One Work',
  first: 'Ada',
  last: 'Writer',
  author: 'Ada Writer',
  workKey: 'onework|adawriter',
  series: '',
  statusRaw: '',
  genreRaw: '',
  tagsRaw: '',
  genre: null,
  genres: [],
  tags: [],
  status: 'standalone',
  gcRead: false,
  tcRead: false,
  duplicate: false,
  ...over,
})

describe('household reconciliation operator boundaries', () => {
  it('builds a minimal psql environment without stale credentials or libpq overrides', () => {
    const child = psqlChildEnvironment(
      {
        PATH: '/usr/local/bin:/usr/bin',
        PGHOSTADDR: '127.0.0.2',
        PGHOST: 'redirect.invalid',
        PGSERVICE: 'unreviewed-service',
        PGSERVICEFILE: '/tmp/unreviewed-service.conf',
        PGSSLMODE: 'disable',
        PGPASSWORD: 'stale-password',
        SUPABASE_DB_URL: 'postgresql://unreviewed.invalid/postgres',
        SUPABASE_SERVICE_ROLE_KEY: 'unrelated-secret',
      },
      'reviewed-uri-password',
    )

    expect(child).toEqual({
      PATH: '/usr/local/bin:/usr/bin',
      PGPASSWORD: 'reviewed-uri-password',
    })
    expect(
      psqlChildEnvironment({ PATH: '/usr/bin', PGPASSWORD: 'stale-password' }, undefined),
    ).toEqual({ PATH: '/usr/bin' })
  })

  it('executes the psql child without allowing hostile PGHOSTADDR to override the URI host', () => {
    const root = mkdtempSync(join(tmpdir(), 'reverie-artifacts-'))
    try {
      const fakePsql = join(root, 'fake-psql.mjs')
      writeFileSync(
        fakePsql,
        `#!/usr/bin/env node
const connection = new URL(process.argv[2])
process.stdout.write(JSON.stringify({
  argv: process.argv.slice(2),
  destination: process.env.PGHOSTADDR ?? connection.hostname,
  environment: process.env,
}))
`,
        { mode: 0o700 },
      )
      chmodSync(fakePsql, 0o700)

      const output = executePsql(
        'postgresql://reader:reviewed%2Dpassword@db.reviewed.test:5432/reverie?sslmode=require',
        ['--hostile-environment-probe'],
        {
          executable: fakePsql,
          sourceEnvironment: {
            PATH: process.env.PATH ?? '/usr/bin:/bin',
            PGHOSTADDR: '192.0.2.123',
            PGHOST: 'redirect.invalid',
            PGSERVICE: 'unreviewed-service',
            PGSERVICEFILE: '/tmp/unreviewed-service.conf',
            PGSSLMODE: 'disable',
            PGPASSWORD: 'stale-password',
            SUPABASE_DB_URL: 'postgresql://unreviewed.invalid/postgres',
            SUPABASE_SERVICE_ROLE_KEY: 'unrelated-secret',
          },
        },
      )
      const observed = JSON.parse(output) as {
        argv: string[]
        destination: string
        environment: NodeJS.ProcessEnv
      }

      expect(observed.destination).toBe('db.reviewed.test')
      expect(observed.argv).toEqual([
        'postgresql://reader@db.reviewed.test:5432/reverie?sslmode=require',
        '--hostile-environment-probe',
      ])
      expect(observed.environment).toMatchObject({
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        PGPASSWORD: 'reviewed-password',
      })
      expect(observed.environment).not.toHaveProperty('PGHOSTADDR')
      expect(observed.environment).not.toHaveProperty('PGHOST')
      expect(observed.environment).not.toHaveProperty('PGSERVICE')
      expect(observed.environment).not.toHaveProperty('PGSERVICEFILE')
      expect(observed.environment).not.toHaveProperty('PGSSLMODE')
      expect(observed.environment).not.toHaveProperty('SUPABASE_DB_URL')
      expect(observed.environment).not.toHaveProperty('SUPABASE_SERVICE_ROLE_KEY')
      expect(output).not.toContain('unrelated-secret')
      expect(output).not.toContain('192.0.2.123')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('creates a new private artifact directory below an existing canonical parent', () => {
    const root = mkdtempSync(join(tmpdir(), 'reverie-artifacts-'))
    try {
      const repository = join(root, 'repo')
      const artifactDirectory = join(root, 'reconciliation')
      mkdirSync(repository, { mode: 0o700 })

      expect(ensurePrivateArtifactDirectory(artifactDirectory, repository)).toBe(
        realpathSync(artifactDirectory),
      )
      expect(statSync(artifactDirectory).mode & 0o777).toBe(0o700)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('reuses an existing owner-private artifact directory unchanged, including its contents', () => {
    const root = mkdtempSync(join(tmpdir(), 'reverie-artifacts-'))
    try {
      const repository = join(root, 'repo')
      const privateDirectory = join(root, 'existing-private')
      mkdirSync(repository, { mode: 0o700 })
      mkdirSync(privateDirectory, { mode: 0o700 })
      chmodSync(privateDirectory, 0o700)
      const existing = join(privateDirectory, 'unrelated.txt')
      writeFileSync(existing, 'keep me\n', { mode: 0o600 })
      const before = lstatSync(privateDirectory)

      expect(ensurePrivateArtifactDirectory(privateDirectory, repository)).toBe(
        realpathSync(privateDirectory),
      )
      const after = lstatSync(privateDirectory)
      expect(after.mode).toBe(before.mode)
      expect(after.mtimeMs).toBe(before.mtimeMs)
      expect(readFileSync(existing, 'utf8')).toBe('keep me\n')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('refuses broad or permissive existing artifact paths without changing their permissions', () => {
    const root = mkdtempSync(join(tmpdir(), 'reverie-artifacts-'))
    try {
      const repository = join(root, 'repo')
      const permissive = join(root, 'permissive')
      const broadSystemPaths = [...new Set(['/tmp', tmpdir(), homedir()])]
      mkdirSync(repository, { mode: 0o700 })
      mkdirSync(permissive, { mode: 0o755 })
      chmodSync(permissive, 0o755)
      const permissiveMode = statSync(permissive).mode & 0o777
      const broadModes = broadSystemPaths.map((path) => [path, lstatSync(path).mode] as const)

      expect(() => ensurePrivateArtifactDirectory(permissive, repository)).toThrow(
        'existing artifact directory must have permissions 0700',
      )
      for (const broadPath of broadSystemPaths) {
        expect(() => ensurePrivateArtifactDirectory(broadPath, repository)).toThrow()
      }
      expect(statSync(permissive).mode & 0o777).toBe(permissiveMode)
      for (const [broadPath, mode] of broadModes) {
        expect(lstatSync(broadPath).mode).toBe(mode)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a symlinked parent into the repository before creating the artifact directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'reverie-artifacts-'))
    try {
      const repository = join(root, 'repo')
      const alias = join(root, 'repository-alias')
      const artifactDirectory = join(alias, 'private-artifacts')
      mkdirSync(repository, { mode: 0o700 })
      symlinkSync(repository, alias)

      expect(() => ensurePrivateArtifactDirectory(artifactDirectory, repository)).toThrow(
        'artifact directory would be created inside the repository',
      )
      expect(() => statSync(join(repository, 'private-artifacts'))).toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('canonicalizes an external symlinked parent before creating the artifact directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'reverie-artifacts-'))
    try {
      const repository = join(root, 'repo')
      const privateParent = join(root, 'private-parent')
      const alias = join(root, 'private-parent-alias')
      const artifactDirectory = join(alias, 'reconciliation')
      mkdirSync(repository, { mode: 0o700 })
      mkdirSync(privateParent, { mode: 0o700 })
      symlinkSync(privateParent, alias)

      const canonical = ensurePrivateArtifactDirectory(artifactDirectory, repository)

      expect(canonical).toBe(join(realpathSync(privateParent), 'reconciliation'))
      expect(realpathSync(artifactDirectory)).toBe(canonical)
      expect(statSync(canonical).mode & 0o777).toBe(0o700)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('household CSV duplicate rules', () => {
  it('drops explicitly marked duplicates but preserves both reader markers across exact rows', () => {
    const result = collapseHouseholdRecords([
      record({ tcRead: true }),
      record({ gcRead: true }),
      record({ title: 'Dropped', duplicate: true }),
    ])
    expect(result.duplicateMarkedDropped).toBe(1)
    expect(result.exactRowsCollapsed).toBe(1)
    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({ tcRead: true, gcRead: true })
  })
})

describe('household reconciliation plan', () => {
  it('makes every resolved CSV work household-owned and uses TC=A / GC=B only for personal scope', () => {
    const plan = planHouseholdReconciliation({
      records: [
        record({ tcRead: true }),
        record({
          title: 'Two Work',
          first: 'Bea',
          last: 'Writer',
          author: 'Bea Writer',
          workKey: 'twowork|beawriter',
          gcRead: true,
        }),
        record({
          title: 'Household Only',
          first: 'Cal',
          last: 'Writer',
          author: 'Cal Writer',
          workKey: 'householdonly|calwriter',
        }),
      ],
      works: [
        { id: 'w1', title: 'One Work', author_text: 'Ada Writer' },
        { id: 'w2', title: 'Two Work', author_text: 'Bea Writer' },
        { id: 'w3', title: 'Household Only', author_text: 'Cal Writer' },
      ],
      books: [
        { id: 'old-a', owner_id: 'a', corpus_work_id: 'outside', removed_at: null },
        { id: 'restore-b', owner_id: 'b', corpus_work_id: 'w2', removed_at: '2026-01-01' },
      ],
      householdWorks: [
        { work_id: 'w1', removed_at: null },
        { work_id: 'w3', removed_at: '2026-01-01' },
        { work_id: 'outside', removed_at: null },
      ],
      accountA: 'a',
      accountB: 'b',
    })
    expect(plan.canWrite).toBe(true)
    expect(plan.personal.create.map((item) => [item.accountId, item.workId])).toEqual([['a', 'w1']])
    expect(plan.personal.restore).toEqual([{ accountId: 'b', bookId: 'restore-b', workId: 'w2' }])
    expect(plan.personal.archive).toEqual([{ accountId: 'a', bookId: 'old-a', workId: 'outside' }])
    expect(plan.household).toEqual({
      create: ['w2'],
      restore: ['w3'],
      archive: ['outside'],
      unchanged: 1,
    })
  })

  it('blocks writes when one account has duplicate active personal rows for a desired work', () => {
    const plan = planHouseholdReconciliation({
      records: [record({ tcRead: true })],
      works: [{ id: 'w1', title: 'One Work', author_text: 'Ada Writer' }],
      books: [
        { id: 'b1', owner_id: 'a', corpus_work_id: 'w1', removed_at: null },
        { id: 'b2', owner_id: 'a', corpus_work_id: 'w1', removed_at: null },
      ],
      householdWorks: [],
      accountA: 'a',
      accountB: 'b',
    })
    expect(plan.canWrite).toBe(false)
    expect(plan.personal.duplicateActiveConflicts).toEqual([
      { accountId: 'a', workId: 'w1', bookIds: ['b1', 'b2'] },
    ])
  })

  it('blocks writes for absent or ambiguous corpus identity', () => {
    const plan = planHouseholdReconciliation({
      records: [
        record({}),
        record({
          title: 'Absent',
          first: 'No',
          last: 'Match',
          author: 'No Match',
          workKey: 'absent|nomatch',
        }),
      ],
      works: [
        { id: 'w1', title: 'One Work', author_text: 'Ada Writer' },
        { id: 'w2', title: 'One Work', author_text: 'Ada Writer' },
      ],
      books: [],
      householdWorks: [],
      accountA: 'a',
      accountB: 'b',
    })
    expect(plan.canWrite).toBe(false)
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.unmatched).toHaveLength(1)
  })
})

describe('household reconciliation read-only planning pagination', () => {
  const ranged =
    <Row extends Record<string, unknown>>(rows: Row[]) =>
    async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
      count: rows.length,
    })

  it('accepts healthy exact-page and cross-page boundaries through the production helper', async () => {
    await expect(
      pageQuery('exact boundary', ['id'], ranged([{ id: 'a' }, { id: 'b' }]), 2),
    ).resolves.toHaveLength(2)
    await expect(
      pageQuery('cross boundary', ['id'], ranged([{ id: 'a' }, { id: 'b' }, { id: 'c' }]), 2),
    ).resolves.toHaveLength(3)
  })

  it('rejects a repeated primary key even when its non-key payload changes', async () => {
    const pages = [
      [
        { id: 'a', value: 'old-a' },
        { id: 'b', value: 'old-b' },
      ],
      [
        { id: 'b', value: 'new-b' },
        { id: 'c', value: 'new-c' },
      ],
    ]
    await expect(
      pageQuery(
        'changed duplicate',
        ['id'],
        async (from) => ({ data: pages[from / 2] ?? [], error: null, count: 4 }),
        2,
      ),
    ).rejects.toThrow('repeated a primary key')
  })

  it('does not claim snapshot isolation for equal-count replacement between planning pages', async () => {
    const pages = [
      [{ id: 'a' }, { id: 'b' }],
      [{ id: 'd' }, { id: 'e' }],
    ]
    await expect(
      pageQuery(
        'planning changed rows',
        ['id'],
        async (from) => ({ data: pages[from / 2] ?? [], error: null, count: 4 }),
        2,
      ),
    ).resolves.toEqual([{ id: 'a' }, { id: 'b' }, { id: 'd' }, { id: 'e' }])
  })

  it('uses the complete composite primary-key tuple', async () => {
    await expect(
      pageQuery(
        'composite duplicate',
        ['household_id', 'work_id'],
        ranged([
          { household_id: 'h', work_id: 'a', value: 'old' },
          { household_id: 'h', work_id: 'a', value: 'new' },
        ]),
        1,
      ),
    ).rejects.toThrow('repeated a primary key')
    await expect(
      pageQuery(
        'same payload distinct key',
        ['id'],
        ranged([
          { id: 'a', value: 'same' },
          { id: 'b', value: 'same' },
        ]),
        1,
      ),
    ).resolves.toHaveLength(2)
  })

  it('fails closed for missing key columns, unavailable counts, and partial pages', async () => {
    await expect(pageQuery('missing key', ['id'], ranged([{ value: 'row' }]), 2)).rejects.toThrow(
      'missing primary-key column id',
    )
    await expect(
      pageQuery('missing count', ['id'], async () => ({ data: [], error: null, count: null }), 2),
    ).rejects.toThrow('exact row count is unavailable')
    await expect(
      pageQuery('partial', ['id'], async () => ({ data: [{ id: 'a' }], error: null, count: 2 }), 2),
    ).rejects.toThrow('read 1 of 2')
  })
})

describe('household reconciliation psql credential boundary', () => {
  it('removes an encoded authority password while preserving multi-host and query semantics', () => {
    const result = psqlConnectionBoundary(
      'postgresql://reader:p%40ss@host1:5432,host2:5433/db?sslmode=verify-full&application_name=reverie&options=-c%20statement_timeout%3D5s',
    )
    expect(result.password).toBe('p@ss')
    expect(result.databaseArgument).not.toContain('p%40ss')
    expect(result.databaseArgument).not.toContain('p@ss')
    expect(result.databaseArgument).toBe(
      'postgresql://reader@host1:5432,host2:5433/db?sslmode=verify-full&application_name=reverie&options=-c%20statement_timeout%3D5s',
    )
  })

  it('extracts a query password and rejects ambiguous or malformed credential input', () => {
    expect(
      psqlConnectionBoundary('postgres://reader@db.test/app?password=p%40ss&sslmode=require'),
    ).toEqual({
      databaseArgument: 'postgres://reader@db.test/app?sslmode=require',
      password: 'p@ss',
    })
    expect(() => psqlConnectionBoundary('postgres://reader:one@db.test/app?password=two')).toThrow(
      'ambiguous password',
    )
    expect(() =>
      psqlConnectionBoundary('postgres://reader@db.test/app?sslpassword=client-key-secret'),
    ).toThrow('sslpassword cannot be passed')
    expect(() => psqlConnectionBoundary('https://reader:secret@db.test/app')).toThrow(
      'postgres:// or postgresql://',
    )
  })
})

describe('household reconciliation approval boundaries', () => {
  it('requires the exact reviewed SHA-256 value', () => {
    const checksum = 'a'.repeat(64)
    expect(() => requireApprovedSha256('dry-run', checksum.toUpperCase(), checksum)).not.toThrow()
    expect(() => requireApprovedSha256('dry-run', '', checksum)).toThrow(
      '--approved-dry-run-sha256',
    )
    expect(() => requireApprovedSha256('backup', 'b'.repeat(64), checksum)).toThrow(
      'checksum does not match',
    )
  })

  it('compares only rollback-scoped state and excludes audit-only corpus fields', () => {
    const base = {
      createdAt: 'before',
      endpoint: 'https://project.test',
      accounts: ['a', 'b'],
      householdId: 'h',
      ownerTables: { books: [{ id: 'book' }] },
      household: { works: [{ work_id: 'work' }] },
      reconciliationFence: { roster: ['a', 'b'] },
      corpusCount: 10,
      planningWorks: [{ id: 'work' }],
    }
    expect(reconciliationRollbackScope(base)).toEqual(
      reconciliationRollbackScope({
        ...base,
        createdAt: 'after',
        corpusCount: 11,
        planningWorks: [{ id: 'work' }, { id: 'unrelated' }],
      }),
    )
    expect(reconciliationRollbackScope(base)).not.toEqual(
      reconciliationRollbackScope({
        ...base,
        ownerTables: { books: [{ id: 'changed' }] },
      }),
    )
  })
})
