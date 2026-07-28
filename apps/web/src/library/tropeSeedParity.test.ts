import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SEED_TROPES } from '@reverie/core'

// The trope_system migration's canonical INSERT block is GENERATED from core SEED_TROPES.
// This test pins the two together — edit the taxonomy, regenerate the block, or fail loudly.

describe('trope seed ↔ migration parity', () => {
  // The canonical rows are seeded across two migrations: trope_system (the original 163) and
  // taxonomy_neutral (the genre-neutral additions). Their UNION must equal SEED_TROPES.
  const rowsFrom = (file: string) => {
    const sql = readFileSync(join(__dirname, '../../../../supabase/migrations/', file), 'utf8')
    const block = sql.slice(
      sql.indexOf('insert into public.tropes (name, facet, genre_affinity, aliases)'),
      sql.indexOf('on conflict do nothing'),
    )
    return {
      block,
      rows: [...block.matchAll(/\('((?:[^']|'')+)', '(\w+)', (.*?), (.*?)\)(?:,|\s*$)/gm)],
    }
  }
  const original = rowsFrom('20260717010000_trope_system.sql')
  const added = rowsFrom('20260721020000_taxonomy_neutral.sql')
  const rows = [...original.rows, ...added.rows]

  it('every seed trope appears exactly once with its facet (across both migrations)', () => {
    expect(rows.length).toBe(SEED_TROPES.length)
    const byName = new Map(rows.map((m) => [m[1]!.replace(/''/g, "'").toLowerCase(), m[2]]))
    for (const t of SEED_TROPES) {
      expect(byName.get(t.name.toLowerCase()), t.name).toBe(t.facet)
    }
  })

  it('affinities and aliases ride along', () => {
    const text = original.block.toLowerCase()
    expect(text).toContain("array['romance', 'fantasy']")
    expect(text).toContain("'werewolves'")
    // the broadening carries genre affinities + aliases too
    expect(added.block.toLowerCase()).toContain("array['mystery']")
    expect(added.block.toLowerCase()).toContain("'journalism'")
  })
})
