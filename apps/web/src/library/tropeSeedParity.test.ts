import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SEED_TROPES } from '@reverie/core'

// The trope_system migration's canonical INSERT block is GENERATED from core SEED_TROPES.
// This test pins the two together — edit the taxonomy, regenerate the block, or fail loudly.

describe('trope seed ↔ migration parity', () => {
  const sql = readFileSync(join(__dirname, '../../../../supabase/migrations/20260717010000_trope_system.sql'), 'utf8')
  const block = sql.slice(sql.indexOf('insert into public.tropes (name, facet, genre_affinity, aliases)'), sql.indexOf('on conflict do nothing'))
  const rows = [...block.matchAll(/\('((?:[^']|'')+)', '(\w+)', (.*?), (.*?)\)(?:,|\s*$)/gm)]

  it('every seed trope appears exactly once with its facet', () => {
    expect(rows.length).toBe(SEED_TROPES.length)
    const byName = new Map(rows.map((m) => [m[1]!.replace(/''/g, "'").toLowerCase(), m[2]]))
    for (const t of SEED_TROPES) {
      expect(byName.get(t.name.toLowerCase()), t.name).toBe(t.facet)
    }
  })

  it('affinities and aliases ride along', () => {
    const text = block.toLowerCase()
    expect(text).toContain("array['romance', 'fantasy']")
    expect(text).toContain("'werewolves'")
  })
})
