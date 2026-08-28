import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(__dirname, '../../../supabase/migrations/20260830010000_library_membership_foundation.sql'),
  'utf8',
)

function section(start: string, end: string): string {
  const startIndex = migration.indexOf(start)
  const endIndex = migration.indexOf(end, startIndex + start.length)

  expect(startIndex, `missing migration section start: ${start}`).toBeGreaterThanOrEqual(0)
  expect(endIndex, `missing migration section end: ${end}`).toBeGreaterThan(startIndex)
  return migration.slice(startIndex, endIndex)
}

describe('library membership migration backfill shape', () => {
  it('materializes reusable corpus and personal identity snapshots', () => {
    const setup = section(
      'select public.rekey_legacy_library_work_keys();',
      '-- Every legacy personal row gets a corpus anchor.',
    )

    expect(migration).toContain('create index works_library_work_key_idx')
    expect(setup).toContain('create temporary table library_work_fallback_owners')
    expect(setup).toContain('create temporary table library_work_isbn_owners')
    expect(setup).toContain('create temporary table library_book_identities')
  })

  it('matches existing identities through materialized sets instead of a correlated OR scan', () => {
    const backfill = section(
      '-- Every legacy personal row gets a corpus anchor.',
      '-- Ambiguous ISBN or title+author fallbacks get a per-row reconciliation anchor.',
    )

    expect(backfill).toContain('existing_isbns as materialized')
    expect(backfill).toContain('existing_fallback_keys as materialized')
    expect(backfill).not.toContain('select 1 from public.works existing')
  })

  it('computes reconciliation and binding identities once per corpus scan', () => {
    const reconciliation = section(
      '-- Ambiguous ISBN or title+author fallbacks get a per-row reconciliation anchor.',
      'alter table public.books alter column corpus_work_id set not null;',
    )

    expect(reconciliation).toContain('work_isbn_counts as materialized')
    expect(reconciliation).toContain('work_fallback_counts as materialized')
    expect(reconciliation).toContain('unique_isbn_targets as materialized')
    expect(reconciliation).toContain('unique_fallback_targets as materialized')
    expect(reconciliation).toContain('create temporary table library_book_corpus_bindings')
    expect(reconciliation).not.toMatch(/select\s+count\(\*\)::int\s+from\s+public\.works/)
    expect(reconciliation).not.toMatch(
      /select\s+\(array_agg\(w\.id order by w\.id\)\)\[1\]\s+from\s+public\.works/,
    )
  })
})
