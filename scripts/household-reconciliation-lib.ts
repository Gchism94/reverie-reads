import { workKeyOf } from '../packages/core/src/normalize'
import type { ImportRecord } from './corpus-import-lib'

/** Stable total ordering for every table copied into the pre-reconciliation rollback snapshot.
 * PostgREST pagination over only the owner column is nondeterministic when one owner has more than
 * one page of rows. These are the real primary-key columns, so every page boundary is repeatable. */
export const RECONCILIATION_BACKUP_PRIMARY_KEYS: Record<string, readonly string[]> = {
  books: ['id'],
  reads: ['id'],
  lists: ['id'],
  list_items: ['list_id', 'book_id'],
  reviews: ['id'],
  merge_verdicts: ['owner_id', 'book_id', 'incoming_key'],
  profiles: ['id'],
  book_tropes: ['book_id', 'trope_id'],
  book_moods: ['book_id', 'mood_id'],
  tropes: ['id'],
  moods: ['id'],
  author_follows: ['user_id', 'author_name'],
  authors: ['id'],
  book_authors: ['book_id', 'author_id', 'role'],
  book_embeddings: ['book_id'],
  match_feedback: ['user_id', 'book_id', 'kind'],
  series: ['id'],
  household_members: ['household_id', 'user_id'],
  household_works: ['household_id', 'work_id'],
  household_book_shares: ['book_id'],
  household_work_enrichment: ['household_id', 'work_id'],
  work_metadata_edits: ['id'],
  corpus_admins: ['user_id'],
  work_tropes: ['work_id', 'trope_id'],
  clubs: ['id'],
  club_members: ['club_id', 'user_id'],
  club_comments: ['id'],
  shared_refs: ['owner_id', 'code'],
  content_reports: ['id'],
  sweep_traces: ['id'],
  series_entries: ['id'],
  trope_suggestions: ['book_id', 'trope_id'],
  series_merge_decisions: ['id'],
}

export interface ReconciliationWorkRow {
  id: string
  title: string
  author_text: string | null
}

export interface ReconciliationBookRow {
  id: string
  owner_id: string
  corpus_work_id: string
  removed_at: string | null
}

export interface ReconciliationHouseholdWorkRow {
  work_id: string
  removed_at: string | null
}

export interface ResolvedCsvWork {
  record: ImportRecord
  workId: string
}

export interface HouseholdReconciliationPlan {
  records: ImportRecord[]
  resolved: ResolvedCsvWork[]
  duplicateMarkedDropped: number
  exactRowsCollapsed: number
  unmatched: ImportRecord[]
  conflicts: Array<{ record: ImportRecord; workIds: string[] }>
  personal: {
    create: Array<{ accountId: string; workId: string; record: ImportRecord }>
    restore: Array<{ accountId: string; bookId: string; workId: string }>
    archive: Array<{ accountId: string; bookId: string; workId: string }>
    unchanged: number
    duplicateActiveConflicts: Array<{ accountId: string; workId: string; bookIds: string[] }>
  }
  household: {
    create: string[]
    restore: string[]
    archive: string[]
    unchanged: number
  }
  canWrite: boolean
}

/** Duplicate annotations do not erase reader markers. Exact rows collapse by OR-ing TC/GC, while
 * rows explicitly marked Duplicate are excluded exactly as the source file requests. */
export function collapseHouseholdRecords(records: readonly ImportRecord[]): {
  records: ImportRecord[]
  duplicateMarkedDropped: number
  exactRowsCollapsed: number
} {
  const byKey = new Map<string, ImportRecord>()
  let duplicateMarkedDropped = 0
  let exactRowsCollapsed = 0
  for (const record of records) {
    if (record.duplicate) {
      duplicateMarkedDropped++
      continue
    }
    const prior = byKey.get(record.workKey)
    if (!prior) {
      byKey.set(record.workKey, record)
      continue
    }
    exactRowsCollapsed++
    byKey.set(record.workKey, {
      ...prior,
      tcRead: prior.tcRead || record.tcRead,
      gcRead: prior.gcRead || record.gcRead,
    })
  }
  return { records: [...byKey.values()], duplicateMarkedDropped, exactRowsCollapsed }
}

const workComparisonKey = (work: ReconciliationWorkRow): string =>
  workKeyOf({ title: work.title, first: work.author_text ?? '' })

export function planHouseholdReconciliation({
  records: inputRecords,
  works,
  books,
  householdWorks,
  accountA,
  accountB,
}: {
  records: readonly ImportRecord[]
  works: readonly ReconciliationWorkRow[]
  books: readonly ReconciliationBookRow[]
  householdWorks: readonly ReconciliationHouseholdWorkRow[]
  accountA: string
  accountB: string
}): HouseholdReconciliationPlan {
  const { records, duplicateMarkedDropped, exactRowsCollapsed } =
    collapseHouseholdRecords(inputRecords)
  const workIdsByKey = new Map<string, string[]>()
  for (const work of works) {
    const key = workComparisonKey(work)
    workIdsByKey.set(key, [...(workIdsByKey.get(key) ?? []), work.id].sort())
  }

  const resolved: ResolvedCsvWork[] = []
  const unmatched: ImportRecord[] = []
  const conflicts: Array<{ record: ImportRecord; workIds: string[] }> = []
  for (const record of records) {
    const matches = workIdsByKey.get(record.workKey) ?? []
    if (matches.length === 1) resolved.push({ record, workId: matches[0]! })
    else if (!matches.length) unmatched.push(record)
    else conflicts.push({ record, workIds: matches })
  }

  const desiredHousehold = new Set(resolved.map((item) => item.workId))
  const desiredByAccount = new Map<string, Map<string, ImportRecord>>([
    [accountA, new Map()],
    [accountB, new Map()],
  ])
  for (const item of resolved) {
    if (item.record.tcRead) desiredByAccount.get(accountA)!.set(item.workId, item.record)
    if (item.record.gcRead) desiredByAccount.get(accountB)!.set(item.workId, item.record)
  }

  const create: HouseholdReconciliationPlan['personal']['create'] = []
  const restore: HouseholdReconciliationPlan['personal']['restore'] = []
  const archive: HouseholdReconciliationPlan['personal']['archive'] = []
  const duplicateActiveConflicts: HouseholdReconciliationPlan['personal']['duplicateActiveConflicts'] =
    []
  let personalUnchanged = 0

  for (const [accountId, desired] of desiredByAccount) {
    const accountBooks = books.filter((book) => book.owner_id === accountId)
    for (const [workId, record] of desired) {
      const active = accountBooks.filter(
        (book) => book.corpus_work_id === workId && book.removed_at === null,
      )
      if (active.length > 1) {
        duplicateActiveConflicts.push({
          accountId,
          workId,
          bookIds: active.map((book) => book.id).sort(),
        })
      } else if (active.length === 1) personalUnchanged++
      else {
        const removed = accountBooks
          .filter((book) => book.corpus_work_id === workId && book.removed_at !== null)
          .sort((a, b) => a.id.localeCompare(b.id))
        if (removed[0]) restore.push({ accountId, bookId: removed[0].id, workId })
        else create.push({ accountId, workId, record })
      }
    }
    for (const book of accountBooks) {
      if (book.removed_at === null && !desired.has(book.corpus_work_id)) {
        archive.push({ accountId, bookId: book.id, workId: book.corpus_work_id })
      }
    }
  }

  const activeHousehold = new Map(
    householdWorks.filter((work) => work.removed_at === null).map((work) => [work.work_id, work]),
  )
  const removedHousehold = new Map(
    householdWorks.filter((work) => work.removed_at !== null).map((work) => [work.work_id, work]),
  )
  const householdCreate: string[] = []
  const householdRestore: string[] = []
  let householdUnchanged = 0
  for (const workId of [...desiredHousehold].sort()) {
    if (activeHousehold.has(workId)) householdUnchanged++
    else if (removedHousehold.has(workId)) householdRestore.push(workId)
    else householdCreate.push(workId)
  }
  const householdArchive = [...activeHousehold.keys()]
    .filter((workId) => !desiredHousehold.has(workId))
    .sort()

  return {
    records,
    resolved,
    duplicateMarkedDropped,
    exactRowsCollapsed,
    unmatched,
    conflicts,
    personal: {
      create,
      restore,
      archive,
      unchanged: personalUnchanged,
      duplicateActiveConflicts,
    },
    household: {
      create: householdCreate,
      restore: householdRestore,
      archive: householdArchive,
      unchanged: householdUnchanged,
    },
    canWrite:
      unmatched.length === 0 && conflicts.length === 0 && duplicateActiveConflicts.length === 0,
  }
}

export function householdReconciliationCounts(plan: HouseholdReconciliationPlan) {
  return {
    csvRowsAfterDuplicateRules: plan.records.length,
    duplicateMarkedDropped: plan.duplicateMarkedDropped,
    exactRowsCollapsed: plan.exactRowsCollapsed,
    resolved: plan.resolved.length,
    unmatched: plan.unmatched.length,
    conflictingCorpusMatches: plan.conflicts.length,
    personalCreate: plan.personal.create.length,
    personalRestore: plan.personal.restore.length,
    personalArchive: plan.personal.archive.length,
    personalUnchanged: plan.personal.unchanged,
    personalDuplicateConflicts: plan.personal.duplicateActiveConflicts.length,
    householdCreate: plan.household.create.length,
    householdRestore: plan.household.restore.length,
    householdArchive: plan.household.archive.length,
    householdUnchanged: plan.household.unchanged,
  }
}
