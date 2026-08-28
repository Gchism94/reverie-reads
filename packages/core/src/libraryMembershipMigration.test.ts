import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(__dirname, '../../../supabase/migrations/20260830010000_library_membership_foundation.sql'),
  'utf8',
)
const workTropesAclMigration = readFileSync(
  join(__dirname, '../../../supabase/migrations/20260901010000_work_tropes_acl.sql'),
  'utf8',
)
const householdCatalogMigration = readFileSync(
  join(__dirname, '../../../supabase/migrations/20260902010000_household_catalog_entry.sql'),
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
  const missingWork = sectionOf(
    source,
    '-- Every legacy personal row gets a corpus anchor.',
    'on conflict (work_key) do nothing;',
  )
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

  if (/\b(?:from|join)\s+public\.works\b/i.test(missingWork)) {
    violations.push('missing-work classification rescans public.works')
  }
  if (/\blateral\b/i.test(missingWork)) {
    violations.push('missing-work classification contains a per-book lateral helper')
  }
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

  it('matches existing identities through materialized sets instead of a correlated corpus scan', () => {
    const backfill = section(
      '-- Every legacy personal row gets a corpus anchor.',
      '-- Ambiguous ISBN or title+author fallbacks get a per-row reconciliation anchor.',
    )

    expect(backfill).toContain('existing_isbns as materialized')
    expect(backfill).toContain('existing_fallback_keys as materialized')
    expect(boundedClassificationViolations(migration)).toEqual([])
  })

  it('rejects the reviewed mutation in missing-work candidate classification', () => {
    const mutation = migration.replace(
      'from candidates c\nleft join existing_isbns isbn_match',
      `from candidates c
cross join lateral (
  select coalesce(sum(1), 0)::int as reviewer_match_count
  from public.works reviewer_work
  where c.normalized_isbn = any(reviewer_work.isbns)
) reviewer_correlated_count
left join existing_isbns isbn_match`,
    )

    expect(mutation).not.toBe(migration)
    expect(boundedClassificationViolations(mutation)).toEqual([
      'missing-work classification rescans public.works',
      'missing-work classification contains a per-book lateral helper',
    ])
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

describe('work-tropes forward ACL repair', () => {
  it('resets every API role before granting back only read-only and service capabilities', () => {
    const normalized = workTropesAclMigration.toLowerCase().replace(/\s+/g, ' ').trim()

    expect(normalized).toContain(
      'revoke all privileges on table public.work_tropes from public, anon, authenticated, service_role;',
    )
    expect(normalized).toContain('grant select on table public.work_tropes to authenticated;')
    expect(normalized).toContain(
      'grant all privileges on table public.work_tropes to service_role;',
    )
    expect(workTropesAclMigration.match(/^grant /gim)).toHaveLength(2)
  })
})

describe('household-only catalog entry and explicit personal adoption', () => {
  it('removes implicit personal-to-corpus promotion and retires its directly callable writer', () => {
    const normalized = householdCatalogMigration.toLowerCase().replace(/\s+/g, ' ').trim()

    expect(normalized).toContain(
      'drop trigger books_sync_objective_metadata_to_corpus on public.books;',
    )
    expect(normalized).toContain(
      'revoke all on function public.update_corpus_work_metadata( uuid, text, text, text[], text[], text, jsonb ) from public, anon, authenticated, service_role;',
    )
    expect(normalized).not.toContain(
      'grant execute on function public.update_corpus_work_metadata(',
    )
  })

  it('creates household membership without manufacturing a personal book', () => {
    const createBoundary = sectionOf(
      householdCatalogMigration,
      'create function public.create_household_catalog_work(',
      '-- The old RPC accepted any member',
    )

    expect(createBoundary).toContain('insert into public.works')
    expect(createBoundary).toContain('insert into public.household_works')
    expect(createBoundary).not.toMatch(/insert\s+into\s+public\.books/i)
    expect(createBoundary).toContain("'household catalog creation'")
  })

  it('holds the exact administrator or owner authority row through a shared edit', () => {
    const editBoundary = sectionOf(
      householdCatalogMigration,
      'create function public.edit_corpus_work_metadata(',
      'revoke all on function public.edit_corpus_work_metadata(',
    )

    expect(editBoundary).toContain('from public.corpus_admins admin')
    expect(editBoundary).toMatch(/from public\.corpus_admins admin[\s\S]*?for update;/)
    expect(editBoundary).toMatch(/member\.role = 'owner'[\s\S]*?for update of member;/)
    expect(editBoundary).not.toContain('if not public.can_edit_corpus_work(p_work)')
  })

  it('keeps personal identity and reader state outside the explicit adoption update', () => {
    const adoption = sectionOf(
      householdCatalogMigration,
      'create function public.adopt_corpus_work_metadata(p_book uuid)',
      'revoke all on function public.adopt_corpus_work_metadata(uuid)',
    )
    const update = sectionOf(adoption, 'update public.books book', 'from public.works work')

    expect(update).toContain('genre = coalesce(work.genre')
    expect(update).toContain('cover_url = work.cover_url')
    expect(update).toContain('cover_thumb_url = null')
    expect(update).not.toMatch(/\btitle\s*=/i)
    expect(update).not.toMatch(/\bisbn\s*=/i)
    expect(update).not.toMatch(/\bownership\s*=/i)
    expect(update).not.toMatch(/\bread_status\s*=/i)
    expect(update).not.toMatch(/\brating\s*=/i)
  })
})
