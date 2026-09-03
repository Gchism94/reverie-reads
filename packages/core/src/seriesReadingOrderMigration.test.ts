import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(__dirname, '../../../supabase/migrations/20260923010000_series_reading_order.sql'),
  'utf8',
)

describe('series reading-order migration', () => {
  it('backfills a non-null order without changing canonical positions', () => {
    expect(sql).toContain('add column sort_order numeric')
    expect(sql).toContain('set sort_order = position')
    expect(sql).toContain('alter column sort_order set not null')
  })

  it('provides an owner-scoped reading-order RPC with explicit role boundaries', () => {
    expect(sql).toContain('create function public.set_series_reading_order')
    expect(sql).toContain('entry.owner_id = uid')
    expect(sql).toContain('entry.removed_at is null')
    expect(sql).toContain("entry.membership_claim ->> 'origin' <> 'unknown'")
    expect(sql).toContain(
      'revoke all on function public.set_series_reading_order(uuid, jsonb)\n  from public, anon, authenticated, service_role;',
    )
    expect(sql).toContain(
      'grant execute on function public.set_series_reading_order(uuid, jsonb)\n  to authenticated;',
    )
  })

  it('updates only the private order and its provenance', () => {
    const body = sql.slice(
      sql.indexOf('create function public.set_series_reading_order'),
      sql.indexOf('revoke all on function public.set_series_reading_order'),
    )
    expect(body).toContain('set sort_order = slot.sort_order')
    expect(body).toContain('sort_user_edited = true')
    expect(body).not.toContain('set position =')
    expect(body).not.toContain('update public.books')
  })
})
