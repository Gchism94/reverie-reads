import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(__dirname, '../../../supabase/migrations/20260911010000_corpus_series_discovery.sql'),
  'utf8',
)

describe('corpus series discovery migration boundaries', () => {
  it('repairs legacy new-table exposure before granting the intended capabilities', () => {
    expect(migration).toContain(
      'revoke all on table public.work_series_suggestions\n  from public, anon, authenticated, service_role;',
    )
    expect(migration).toContain(
      'grant select on table public.work_series_suggestions to authenticated;',
    )
    expect(migration).toContain(
      'grant all on table public.work_series_suggestions to service_role;',
    )
  })

  it('revokes every API role before granting each authenticated RPC', () => {
    for (const signature of [
      'public.record_corpus_series_discovery(uuid, jsonb, timestamptz)',
      'public.review_corpus_series_suggestion(uuid, text)',
    ]) {
      expect(migration).toContain(
        `revoke all on function ${signature}\n  from public, anon, authenticated, service_role;`,
      )
      expect(migration).toContain(`grant execute on function ${signature}\n  to authenticated;`)
    }
  })

  it('makes the pre-review completion implementation private', () => {
    expect(migration).toContain(
      'revoke all on function public.complete_corpus_work_metadata_without_series_review(\n  uuid, jsonb, timestamptz\n) from public, anon, authenticated, service_role;',
    )
    expect(migration).toContain("sanitized_patch := p_patch - 'series' - 'position';")
    expect(migration).toContain("(sanitized_patch -> 'provenance') - 'series' - 'seriesPosition'")
  })

  it('keeps no-series evidence separate from the standalone status field', () => {
    expect(migration).toContain("series_check_state = 'no_series'")
    expect(migration).not.toMatch(/set\s+status\s*=\s*'standalone'/i)
  })
})
