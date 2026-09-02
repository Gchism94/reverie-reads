import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const schema = readFileSync(
  join(
    __dirname,
    '../../../supabase/migrations/20260920010000_canonical_shared_series_catalog.sql',
  ),
  'utf8',
)
const management = readFileSync(
  join(
    __dirname,
    '../../../supabase/migrations/20260920020000_canonical_shared_series_management.sql',
  ),
  'utf8',
)

describe('canonical shared-series catalog migration boundaries', () => {
  it('creates objective shared graph tables without changing the personal authority tables', () => {
    for (const table of [
      'corpus_series',
      'corpus_series_names',
      'corpus_series_sources',
      'corpus_series_entries',
      'corpus_series_edits',
    ]) {
      expect(schema).toContain(`create table public.${table}`)
    }
    const syncBody = schema.slice(
      schema.indexOf('create function public.sync_corpus_series_catalog_work'),
      schema.indexOf('create function public.sync_corpus_series_catalog_work_trigger'),
    )
    expect(syncBody).not.toContain('public.series_entries')
    expect(syncBody).not.toContain('public.series ')
  })

  it('repairs dirty table ACLs before granting read-only authenticated access', () => {
    expect(schema).toContain(
      'revoke all on table public.corpus_series, public.corpus_series_names,\n  public.corpus_series_sources, public.corpus_series_entries, public.corpus_series_edits\n  from public, anon, authenticated, service_role;',
    )
    expect(schema).toContain(
      'grant select on table public.corpus_series, public.corpus_series_names,\n  public.corpus_series_sources, public.corpus_series_entries to authenticated;',
    )
    expect(schema).not.toMatch(/grant (insert|update|delete).*to authenticated/i)
  })

  it('revokes every API role before granting the administrator RPCs', () => {
    const compactManagement = management
      .replace(/\s+/g, ' ')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
    for (const signature of [
      'public.update_corpus_series(uuid, bigint, text, text, integer, text[])',
      'public.merge_corpus_series(uuid, uuid, bigint, bigint)',
      'public.archive_corpus_series(uuid, bigint)',
      'public.restore_corpus_series(uuid, bigint)',
      'public.save_corpus_series_entry(uuid, bigint, uuid, text, text, numeric, text)',
      'public.remove_corpus_series_entry(uuid, bigint)',
      'public.list_archived_corpus_series()',
    ]) {
      expect(compactManagement).toContain(
        `revoke all on function ${signature} from public, anon, authenticated, service_role;`,
      )
      expect(compactManagement).toContain(`grant execute on function ${signature}`)
    }
  })

  it('uses provider identity first and an unambiguous name-plus-creator fallback', () => {
    expect(schema).toContain("'source:' || v_source_name || ':' || v_source_ref")
    expect(schema).toContain("'name:' || v_name_key || ':' || v_creator_key")
    expect(schema).toContain('having count(distinct n.series_id) = 1;')
    expect(schema).not.toMatch(/where n\.name_key = name_key\s*;$/m)
  })

  it('backfills only reviewed corpus truth and protects stale administrator forms', () => {
    expect(schema).toContain("w.series_check_state in ('found', 'review')")
    expect(schema).not.toContain("w.series_check_state in ('unknown'")
    expect(management.match(/p_expected_revision/g)?.length).toBeGreaterThanOrEqual(11)
    expect(management).toContain(
      "raise exception 'corpus series changed; refresh before saving' using errcode = 'PT409';",
    )
  })

  it('projects through works while retaining reader and import authority in the existing trigger', () => {
    expect(management).toContain("set_config('reverie.series_manual_editor', 'on', true)")
    expect(management).toContain("set_config('reverie.corpus_series_target', p_series::text, true)")
    expect(management).toContain('update public.works w')
    expect(schema).not.toContain('update public.books')
  })

  it('turns a deleted work membership into a non-primary unbound slot before the FK runs', () => {
    expect(schema).toContain('create function public.detach_corpus_series_work_before_delete()')
    expect(schema).toContain('before delete on public.works')
    expect(schema).toContain('set work_id = null,')
    expect(schema).toContain('is_primary = false,')
    expect(schema).toContain("'work_detach'")
    expect(schema).toContain(
      'revoke all on function public.detach_corpus_series_work_before_delete()\n  from public, anon, authenticated, service_role;',
    )
  })
})
