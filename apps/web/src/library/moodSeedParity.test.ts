import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SEED_MOODS } from '@reverie/core'

// The mood_system migration's canonical INSERT block is GENERATED from core SEED_MOODS.
// This test pins the two together — edit the vocabulary, regenerate the block, or fail loudly.

describe('mood seed ↔ migration parity', () => {
  const sql = readFileSync(
    join(__dirname, '../../../../supabase/migrations/20260721030000_mood_system.sql'),
    'utf8',
  )
  const block = sql.slice(sql.indexOf('insert into public.moods (name)'), sql.indexOf('on conflict do nothing'))
  const names = [...block.matchAll(/\('((?:[^']|'')+)'\)/g)].map((m) => m[1]!.replace(/''/g, "'"))

  it('every seed mood appears exactly once, same set as SEED_MOODS', () => {
    expect(names.length).toBe(SEED_MOODS.length)
    expect(new Set(names)).toEqual(new Set(SEED_MOODS.map((m) => m.name)))
  })

  it('there is NO book_moods backfill — mood is never derived', () => {
    // The governing rule, pinned: unlike the trope migration, the mood migration must not populate
    // book_moods from any source. If a backfill is ever added, this fails and forces a re-review.
    expect(sql).not.toMatch(/insert\s+into\s+public\.book_moods/i)
  })
})
