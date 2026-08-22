import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SUBGENRE_PRIMARY_GENRE } from '@reverie/core'
import { GENRE_SUBGENRES, NEUTRAL_SUBGENRE } from './constants'

// Three artifacts hold the subgenre → primary-genre knowledge: the GENRE_SUBGENRES taxonomy
// (source of truth for what exists), core's SUBGENRE_PRIMARY_GENRE (the inference map), and the
// book_editing migration's VALUES list (the SQL mirror). This test pins all three together.

/** subgenre (lowercased) → the set of genres offering it. */
function membership(): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>()
  for (const [genre, subs] of Object.entries(GENRE_SUBGENRES)) {
    for (const s of subs) {
      const k = s.toLowerCase()
      if (!m.has(k)) m.set(k, new Set())
      m.get(k)!.add(genre)
    }
  }
  return m
}

describe('subgenre → primary-genre inference stays true to the taxonomy', () => {
  const byGenreCount = membership()

  it('every single-genre subgenre maps to exactly that genre', () => {
    for (const [sub, genres] of byGenreCount) {
      if (genres.size === 1) {
        expect(SUBGENRE_PRIMARY_GENRE[sub], `expected '${sub}' → '${[...genres][0]}'`).toBe(
          [...genres][0],
        )
      }
    }
  })

  it('every shared subgenre (and the neutral catch-all) is absent — never guessed', () => {
    for (const [sub, genres] of byGenreCount) {
      if (genres.size > 1) {
        expect(
          SUBGENRE_PRIMARY_GENRE[sub],
          `'${sub}' is shared by ${[...genres].join(', ')}`,
        ).toBeUndefined()
      }
    }
    expect(SUBGENRE_PRIMARY_GENRE[NEUTRAL_SUBGENRE.toLowerCase()]).toBeUndefined()
    // legacy romance-era value — ambiguous between the fantasy genre and romantasy
    expect(SUBGENRE_PRIMARY_GENRE['fantasy']).toBeUndefined()
  })

  it('the map contains nothing outside the taxonomy', () => {
    for (const sub of Object.keys(SUBGENRE_PRIMARY_GENRE)) {
      expect(byGenreCount.has(sub), `'${sub}' is not in GENRE_SUBGENRES`).toBe(true)
    }
  })
})

describe('the migrations mirror the inference map exactly', () => {
  // The map is backfilled across two migrations: book_editing (the original taxonomy) and
  // taxonomy_neutral (the genre-neutral broadening). Their UNION must equal SUBGENRE_PRIMARY_GENRE.
  const pairsFrom = (file: string): (readonly [string, string])[] => {
    const sql = readFileSync(join(__dirname, '../../../../supabase/migrations/', file), 'utf8')
    const valuesBlock = sql.slice(
      sql.indexOf('from (values'),
      sql.indexOf(') as m(subgenre, genre)'),
    )
    return [...valuesBlock.matchAll(/\('([^']+)', '([^']+)'\)/g)].map(
      (m) => [m[1]!, m[2]!] as const,
    )
  }
  const sqlPairs = [
    ...pairsFrom('20260715010000_book_editing.sql'),
    ...pairsFrom('20260721020000_taxonomy_neutral.sql'),
  ]

  /**
   * ('romance','romance') is in book_editing's VALUES list and cannot be taken out of it: applied
   * migrations are history, and rewriting one would change what a fresh database replays.
   *
   * The pair is dropped from the TS map by the subgenre-never-a-genre ruling — a genre is never its
   * own subgenre, so there is nothing to infer from it. The migration that carried it is what put
   * the redundant value into the data in the first place; the durable fix is the guard plus a
   * repair, not an edit to the file that ran.
   *
   * Declared here rather than silently filtered, on the principle that an exclusion without a
   * stated reason is the bug.
   */
  const RETIRED_BY_RULING = new Set(['romance'])

  it('every TS pair appears across the SQL VALUES lists, and nothing extra', () => {
    const ts = Object.entries(SUBGENRE_PRIMARY_GENRE)
    const live = sqlPairs.filter(([sub]) => !RETIRED_BY_RULING.has(sub))
    expect(new Map(live)).toEqual(new Map(ts))
    expect(live.length).toBe(ts.length)
  })

  it('every retired pair really was in the SQL — the exclusion cannot go stale', () => {
    // If the pair ever leaves the migration, this exclusion is dead weight and should be deleted.
    const inSql = new Set(sqlPairs.map(([sub]) => sub))
    for (const sub of RETIRED_BY_RULING) expect(inSql.has(sub), `'${sub}' no longer in SQL`).toBe(true)
  })
})
