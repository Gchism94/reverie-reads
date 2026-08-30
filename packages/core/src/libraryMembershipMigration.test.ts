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
const personalCoverProjectionMigration = readFileSync(
  join(
    __dirname,
    '../../../supabase/migrations/20260903010000_personal_cover_scope_projection.sql',
  ),
  'utf8',
)
const coverReviewReleaseGatesMigration = readFileSync(
  join(__dirname, '../../../supabase/migrations/20260904010000_cover_review_release_gates.sql'),
  'utf8',
)
const nonretryableRpcConflictsMigration = readFileSync(
  join(__dirname, '../../../supabase/migrations/20260907010000_nonretryable_rpc_conflicts.sql'),
  'utf8',
)
const rolloutVerification = readFileSync(
  join(__dirname, '../../../docs/queries/library-membership-rollout-verification.sql'),
  'utf8',
)
const corpusAdminOperator = readFileSync(
  join(__dirname, '../../../scripts/set-corpus-admins.mjs'),
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

describe('corpus administrator rollout gate', () => {
  it('does not call a schema-only rollout complete while the runtime roster is empty', () => {
    const assignmentCheck = sectionOf(
      rolloutVerification,
      'runtime_assignment_checks as (',
      'household_table_privilege_checks as (',
    )

    expect(assignmentCheck).toContain("'public.corpus_admins'::text as invariant")
    expect(assignmentCheck).toContain('count(*) > 0 as ok')
    expect(rolloutVerification).toContain('union all select * from runtime_assignment_checks')
  })

  it('can require the requested administrator ids to be the complete reviewed roster', () => {
    expect(corpusAdminOperator).toContain("const requireExact = args.includes('--require-exact')")
    expect(corpusAdminOperator).toContain(
      ".from('corpus_admins')\n    .select('user_id, granted_at')",
    )
    expect(corpusAdminOperator).not.toContain(
      ".from('corpus_admins').select('user_id, granted_at').in('user_id', ids)",
    )
    expect(corpusAdminOperator).toContain('unexpectedAccounts: unexpected.map(assignment)')
    expect(corpusAdminOperator).toContain('exact roster refused:')
    expect(corpusAdminOperator).not.toMatch(/\.delete\s*\(/)
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
    expect(createBoundary).toContain('google_books_display_cover_url_is_valid')
    expect(createBoundary).toContain("supplied_isbn !~ '^[0-9Xx -]+$'")
  })

  it('holds the exact administrator or owner authority row through a shared edit', () => {
    for (const [start, end] of [
      [
        'create function public.edit_corpus_work_metadata(',
        'revoke all on function public.edit_corpus_work_metadata(',
      ],
      [
        'create function public.set_corpus_work_cover(',
        'revoke all on function public.set_corpus_work_cover(',
      ],
    ] as const) {
      const editBoundary = sectionOf(householdCatalogMigration, start, end)

      expect(editBoundary).toContain('from public.corpus_admins admin')
      expect(editBoundary).toMatch(/from public\.corpus_admins admin[\s\S]*?for update;/)
      expect(editBoundary).toMatch(
        /member\.household_id = target_household[\s\S]*?for update of member, household_work;/,
      )
      expect(editBoundary).not.toContain('if not public.can_edit_corpus_work(p_work)')
      const authorityProbe = editBoundary.indexOf(
        'select member.household_id into target_household',
      )
      const allBookLockStart = editBoundary.indexOf('from public.books book', authorityProbe)
      const authorityRecheck = editBoundary.indexOf(
        'member.household_id = target_household',
        allBookLockStart,
      )
      expect(authorityProbe).toBeGreaterThan(-1)
      expect(allBookLockStart).toBeGreaterThan(authorityProbe)
      expect(authorityRecheck).toBeGreaterThan(allBookLockStart)
      const allBookLock = editBoundary.slice(
        allBookLockStart,
        editBoundary.indexOf('for update;', allBookLockStart) + 'for update;'.length,
      )
      expect(allBookLock).toContain('book.corpus_work_id = p_work')
      expect(allBookLock).not.toContain('book.owner_id = caller')
    }
  })

  it('locks the added-by profile before any household row in both household-only add paths', () => {
    for (const [start, end] of [
      [
        'create function public.add_corpus_work_to_household(',
        'revoke all on function public.add_corpus_work_to_household(',
      ],
      [
        'create function public.create_household_catalog_work(',
        'revoke all on function public.create_household_catalog_work(',
      ],
    ] as const) {
      const boundary = sectionOf(householdCatalogMigration, start, end)
      const profileLock = boundary.indexOf('from public.profiles profile')
      const householdLock = boundary.indexOf('from public.households household')
      expect(profileLock).toBeGreaterThan(-1)
      expect(householdLock).toBeGreaterThan(profileLock)
    }
  })

  it('keeps personal identity and reader state outside the explicit adoption update', () => {
    const adoption = sectionOf(
      householdCatalogMigration,
      'create function public.adopt_corpus_work_metadata(p_book uuid)',
      'revoke all on function public.adopt_corpus_work_metadata(uuid)',
    )
    const update = sectionOf(adoption, 'update public.books book', 'from public.works work')

    expect(adoption).toContain('perform public.sync_book_series(')
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

describe('personal cover scope projection', () => {
  it('projects only already-eligible, peer-safe copy covers into the household read model', () => {
    const readModel = sectionOf(
      personalCoverProjectionMigration,
      'create or replace function public.household_library_works()',
      'revoke all on function public.household_library_works()',
    )

    expect(readModel).toContain('book.owner_id = (select auth.uid())')
    expect(readModel).toContain('hosted_book_cover_object_name')
    expect(readModel).toContain('google_books_display_cover_url_is_valid')
    expect(readModel).not.toContain("'coverUrl', book.cover_url")
    expect(readModel).toMatch(
      /book\.ownership = 'owned'[\s\S]*?household_book_shares admitted_share/,
    )
    expect(readModel).toContain('admitted_share.book_id = book.id')
    expect(readModel).toContain('admitted_share.work_id = household_work.work_id')
  })

  it('keeps explicit administrator review additive, fill-only, and lock ordered', () => {
    const promotion = sectionOf(
      personalCoverProjectionMigration,
      'create function public.admin_review_personal_cover_for_corpus(p_book uuid)',
      'revoke all on function public.admin_review_personal_cover_for_corpus(uuid)',
    )

    expect(promotion).toMatch(
      /from public\.profiles profile[\s\S]*?from public\.corpus_admins admin[\s\S]*?from public\.books book[\s\S]*?from public\.works work/,
    )
    expect(promotion).toContain('book.owner_id = caller')
    expect(promotion).toContain('book_corpus_binding_is_unambiguous')
    expect(promotion).toContain('hosted_book_cover_object_name')
    expect(promotion).toContain('google_books_display_cover_url_is_valid')
    expect(promotion).toContain('cover_url = coalesce(work.cover_url, safe_cover)')
    expect(promotion).toContain('work.cover_options || jsonb_build_array(safe_cover_option)')
    expect(promotion).toContain('insert into public.work_metadata_edits')
    expect(promotion).not.toMatch(/\bdelete\b/i)
  })

  it('does not restore the retired general personal-metadata trigger', () => {
    expect(personalCoverProjectionMigration).not.toContain(
      'books_sync_objective_metadata_to_corpus',
    )
    expect(personalCoverProjectionMigration).not.toContain('books_promote_admin_cover_after_insert')
    expect(personalCoverProjectionMigration).not.toContain('books_promote_admin_cover_after_update')
    expect(personalCoverProjectionMigration).not.toContain('returns trigger')
  })
})

describe('cover-review forward release gates', () => {
  it('repairs all six household table ACLs before granting only the intended capabilities', () => {
    const normalized = coverReviewReleaseGatesMigration.toLowerCase().replace(/\s+/g, ' ').trim()

    expect(normalized).toContain(
      'revoke all privileges on table public.households, public.household_members, public.household_works, public.household_book_shares, public.household_work_enrichment, public.work_metadata_edits from public, anon, authenticated, service_role;',
    )
    expect(normalized).toContain(
      'grant select on table public.households, public.household_members to authenticated;',
    )
    expect(normalized).toContain(
      'grant all privileges on table public.households, public.household_members, public.household_works, public.household_book_shares, public.household_work_enrichment, public.work_metadata_edits to service_role;',
    )
    expect(coverReviewReleaseGatesMigration.match(/^grant .*table/gim)).toHaveLength(2)
  })

  it('retires the UUID-only review grant and binds the replacement to the locked work and URL', () => {
    const normalized = coverReviewReleaseGatesMigration.toLowerCase().replace(/\s+/g, ' ').trim()
    const review = sectionOf(
      coverReviewReleaseGatesMigration,
      'create function public.admin_review_personal_cover_for_corpus(',
      'revoke all on function public.admin_review_personal_cover_for_corpus(uuid, uuid, text)',
    )

    expect(normalized).toContain(
      'revoke all on function public.admin_review_personal_cover_for_corpus(uuid) from public, anon, authenticated, service_role;',
    )
    expect(review).toContain('p_expected_work uuid')
    expect(review).toContain('p_expected_cover_url text')
    expect(review).toMatch(
      /from public\.profiles profile[\s\S]*?from public\.corpus_admins admin[\s\S]*?from public\.books book[\s\S]*?from public\.works work/,
    )
    expect(review).toContain('target_book.corpus_work_id is distinct from p_expected_work')
    expect(review).toContain('target_book.cover_url is distinct from expected_cover')
    expect(review).toContain(
      "raise exception 'personal cover context changed before review; refresh and try again'",
    )
    const workLock = review.indexOf('from public.works work')
    const isbnLock = review.indexOf('perform public.lock_library_isbns')
    const bindingCheck = review.indexOf('public.book_corpus_binding_is_unambiguous')
    expect(isbnLock).toBeGreaterThan(-1)
    expect(workLock).toBeGreaterThan(isbnLock)
    expect(bindingCheck).toBeGreaterThan(workLock)
    expect(review).toContain('normalized_isbn := public.canonical_library_isbn(target_book.isbn)')
    expect(review).toContain("normalized_isbn ~ '^[0-9]{13}$'")
    expect(review).toContain('normalized_isbn = any(coalesce(target_work_isbns')
    expect(review).toContain(
      'target_book.corpus_work_id, target_book.title, author_name, normalized_isbn',
    )
    expect(normalized).toContain(
      'grant execute on function public.admin_review_personal_cover_for_corpus(uuid, uuid, text) to authenticated;',
    )
  })

  it('reclassifies every stale write refusal as a bounded HTTP conflict', () => {
    expect(nonretryableRpcConflictsMigration).toContain(
      "'public.admin_review_personal_cover_for_corpus(uuid,uuid,text)'",
    )
    expect(nonretryableRpcConflictsMigration).toContain(
      "'public.admin_review_household_cover_for_corpus(uuid,uuid,uuid,text)'",
    )
    expect(nonretryableRpcConflictsMigration).toContain(
      "execute replace(definition, '''40001''', '''PT409''')",
    )
    expect(nonretryableRpcConflictsMigration).toContain(
      "raise exception 'an unclassified public function still raises retryable SQLSTATE 40001'",
    )
  })

  it('preserves accepted cover URLs at the shared authenticated write boundary', () => {
    const guard = sectionOf(
      coverReviewReleaseGatesMigration,
      'create function public.preserve_authenticated_corpus_cover_options()',
      'revoke all on function public.preserve_authenticated_corpus_cover_options()',
    )

    expect(guard).toContain('(select auth.uid()) is null')
    expect(guard).toContain('old.cover_options')
    expect(guard).toContain('new.cover_options')
    expect(guard).toContain("proposed ->> 'url' = previous ->> 'url'")
    expect(coverReviewReleaseGatesMigration).toContain(
      'create trigger works_preserve_authenticated_cover_options',
    )
    expect(coverReviewReleaseGatesMigration).toContain(
      'before update of cover_options on public.works',
    )
    expect(coverReviewReleaseGatesMigration).toContain(
      'revoke all on function public.preserve_authenticated_corpus_cover_options()\n  from public, anon, authenticated, service_role;',
    )
  })
})
