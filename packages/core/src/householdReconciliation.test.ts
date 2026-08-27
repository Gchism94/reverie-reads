import { describe, expect, it } from 'vitest'
import {
  collapseHouseholdRecords,
  planHouseholdReconciliation,
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
