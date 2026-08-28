import { describe, expect, it } from 'vitest'
import {
  collapseHouseholdRecords,
  pageQuery,
  planHouseholdReconciliation,
  psqlConnectionBoundary,
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
