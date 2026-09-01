import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(__dirname, '../../../supabase/migrations/20260913010000_series_classification_evidence.sql'),
  'utf8',
)
const rebuild = readFileSync(
  join(__dirname, '../../../docs/queries/rebuild-unreviewed-automatic-series.sql'),
  'utf8',
)

describe('series classification evidence migration', () => {
  it('stores durable evidence on both the work and administrator review proposal', () => {
    expect(migration).toContain('add column series_check_evidence jsonb')
    expect(migration).toContain('add column evidence jsonb')
    expect(migration).toContain('add column proposed_count integer')
    expect(migration).toContain('add column identity_confidence text')
    expect(migration).toContain("item ->> 'kind' = 'relational_membership'")
  })

  it('does not auto-apply a search label without relational membership evidence', () => {
    expect(migration).toContain(
      "elsif membership_confidence in ('low', 'none') or not has_relational_evidence then",
    )
    expect(migration).toContain("series_check_state = 'unresolved'")
    expect(migration).toContain(
      "coalesce(current_setting('reverie.series_manual_editor', true), '') <> 'on'",
    )
    expect(migration).toContain("source_name = 'fantasticfiction' then proposed_count := null")
    expect(migration).toContain("lower(trim(item ->> 'source')) <> 'fantasticfiction'")
  })

  it('seeds only unknown or automatic personal defaults and preserves explicit choices', () => {
    expect(migration).toContain("'unknown', 'enrichment', 'corpus'")
    expect(migration).toContain('not coalesce(book.series_user_chosen, false)')
    expect(migration).toContain("and book.status = 'standalone' then 'ongoing'")
    expect(migration).not.toMatch(/coalesce\(book\.series_claim ->> 'origin'.*'reader'.*'import'/s)
  })

  it('retires conflicting automatic structured memberships before projecting the replacement', () => {
    expect(migration).toContain('update public.series_entries entry')
    expect(migration).toContain('entry.removed_at is null')
    expect(migration).toContain('entry.membership_claim')
    expect(migration).toContain('order by book.id\n    for update;')
  })

  it('revokes every API role before regranting the two callable RPCs', () => {
    for (const signature of [
      'public.record_corpus_series_discovery(uuid, jsonb, timestamptz)',
      'public.review_corpus_series_suggestion(uuid, text)',
    ]) {
      expect(migration).toContain(
        `revoke all on function ${signature}\n  from public, anon, authenticated, service_role;`,
      )
      expect(migration).toContain(`grant execute on function ${signature}\n  to authenticated;`)
    }
    expect(migration).toContain(
      'revoke all on function public.edit_corpus_work_metadata_with_manual_series_intent(',
    )
  })

  it('keeps the legacy-data repair out of migrations and behind a dry-run approval guard', () => {
    expect(rebuild).toContain("approval constant text := 'REVIEW_ONLY'")
    expect(rebuild).toContain("approval <> 'RESET_UNREVIEWED_AUTOMATIC_SERIES'")
    expect(rebuild).toContain("'unknown', 'enrichment', 'corpus'")
    expect(rebuild).toMatch(
      /work_series_suggestions suggestion[\s\S]*order by suggestion\.work_id, suggestion\.id[\s\S]*public\.books book[\s\S]*order by book\.id[\s\S]*public\.works work[\s\S]*order by work\.id/,
    )
    expect(rebuild).not.toMatch(/'reader'\s*,\s*'import'/)
  })
})
