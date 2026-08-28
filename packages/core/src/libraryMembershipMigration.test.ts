import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(__dirname, '../../../supabase/migrations/20260830010000_library_membership_foundation.sql'),
  'utf8',
)

function section(start: string, end: string): string {
  return sectionOf(migration, start, end)
}

function sectionOf(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)

  expect(startIndex, `missing migration section start: ${start}`).toBeGreaterThanOrEqual(0)
  expect(endIndex, `missing migration section end: ${end}`).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

function boundedClassificationViolations(source: string): string[] {
  const violations: string[] = []
  const reconciliation = sectionOf(
    source,
    '-- Ambiguous ISBN or title+author fallbacks get a per-row reconciliation anchor.',
    'on conflict (work_key) do nothing;',
  )
  const binding = sectionOf(
    source,
    'with unique_isbn_targets as materialized (',
    '-- This is an internal identity link, not a reader edit.',
  )

  if (/\b(?:from|join)\s+public\.works\b/i.test(reconciliation)) {
    violations.push('reconciliation classification rescans public.works')
  }

  const bindingWorkReferences = binding.match(/\bpublic\.works\b/gi) ?? []
  if (bindingWorkReferences.length !== 1) {
    violations.push('binding classification has an unbounded public.works reference')
  }
  if (/\blateral\b/i.test(binding)) {
    violations.push('binding classification contains a per-book lateral helper')
  }
  if (
    !/left\s+join\s+public\.works\s+reconciliation_target\s+on\s+reconciliation_target\.work_key\s*=\s*'reconcile:'\s*\|\|\s*identity\.book_id::text/is.test(
      binding,
    )
  ) {
    violations.push('binding lacks its single indexed reconciliation-work lookup')
  }

  return violations
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

  it('classifies reconciliation and bindings only from bounded identity snapshots', () => {
    const reconciliation = section(
      '-- Ambiguous ISBN or title+author fallbacks get a per-row reconciliation anchor.',
      'alter table public.books alter column corpus_work_id set not null;',
    )

    expect(reconciliation).toContain('work_isbn_counts as materialized')
    expect(reconciliation).toContain('work_fallback_counts as materialized')
    expect(reconciliation).toContain('unique_isbn_targets as materialized')
    expect(reconciliation).toContain('unique_fallback_targets as materialized')
    expect(reconciliation).toContain('create temporary table library_book_corpus_bindings')
    expect(boundedClassificationViolations(migration)).toEqual([])
  })

  it('rejects the reviewed mutation: a differently spelled correlated works scan', () => {
    const mutation = migration.replace(
      'left join public.works reconciliation_target',
      `cross join lateral (
  select coalesce(sum(1), 0)::int as reviewer_match_count
  from public.works reviewer_work
  where identity.normalized_isbn = any(reviewer_work.isbns)
) reviewer_correlated_count
left join public.works reconciliation_target`,
    )

    expect(mutation).not.toBe(migration)
    expect(boundedClassificationViolations(mutation)).toEqual([
      'binding classification has an unbounded public.works reference',
      'binding classification contains a per-book lateral helper',
    ])
  })
})
