import { describe, expect, it } from 'vitest'
import { applyFieldPicks, mergeFieldOptions } from './mergeFieldPicker'
import { mergeImport, type Incoming } from './match'
import { makeBook } from './book.fixture'
import type { Book } from './types'

const inc = (over: Partial<Incoming>): Incoming => ({
  title: 'Fourth Wing',
  tags: [],
  genres: [],
  ...over,
})

/**
 * `makeBook` requires id + title. Supplying them HERE rather than `as`-casting each call is the
 * difference between a fixture that fails typecheck when Book changes shape and one that silently
 * drifts — Vitest runs on esbuild and would not have noticed either way.
 */
const mine = (over: Partial<Book>): Book => makeBook({ id: 'b1', title: 'Fourth Wing', ...over })

describe('mergeFieldOptions — what a reader is actually offered', () => {
  it('offers an ADD (default on) where mine is blank and theirs has a value', () => {
    const opts = mergeFieldOptions(mine({ subgenre: '' }), inc({ subgenre: 'romantasy' }))
    const row = opts.find((o) => o.key === 'subgenre')!
    expect(row).toMatchObject({ kind: 'add', take: true, mine: '', theirs: 'romantasy' })
  })

  it('offers a REPLACE (default OFF) where both are set and differ — the new capability', () => {
    const opts = mergeFieldOptions(mine({ genre: 'fantasy' }), inc({ genre: 'romance' }))
    const row = opts.find((o) => o.key === 'genre')!
    expect(row).toMatchObject({ kind: 'replace', take: false, mine: 'fantasy', theirs: 'romance' })
  })

  it('offers nothing where the values agree, or where the import has nothing', () => {
    expect(mergeFieldOptions(mine({ genre: 'fantasy' }), inc({ genre: 'fantasy' }))).toEqual([])
    expect(mergeFieldOptions(mine({ genre: 'fantasy' }), inc({}))).toEqual([])
  })

  it('never offers the server-side carve-outs, or the fields the engine refuses to move', () => {
    const opts = mergeFieldOptions(
      mine({ genre: 'fantasy', rating: 4.5 }),
      inc({ genre: 'romance', rating: 5 } as Partial<Incoming>),
    )
    const keys = opts.map((o) => o.key)
    // plan moves whole-or-nothing (take_plan); series_user_chosen is derived in the RPC
    expect(keys).not.toContain('plan')
    expect(keys).not.toContain('series_user_chosen')
    // owned/fave/progress are not in the table at all — the engine never touches them
    for (const k of ['owned', 'fave', 'progress']) expect(keys).not.toContain(k)
    // `rating` IS offered, and that is the feature: both sides set -> a 'replace' row, default OFF.
    // Before this, a reader's 4.5 against an import's 5 was discarded with no way to take theirs.
    expect(opts.find((o) => o.key === 'rating')).toMatchObject({
      kind: 'replace',
      take: false,
      mine: '4.5',
      theirs: '5',
    })
  })
})

describe('applyFieldPicks — what reaches the database', () => {
  const existing = mine({ genre: 'fantasy', subgenre: '', series: '' })
  const incoming = inc({ genre: 'romance', subgenre: 'romantasy', series: 'Empyrean' })

  it("DEFAULT EQUIVALENCE: no picks writes exactly the engine's patch — the regression guard", () => {
    expect(applyFieldPicks(existing, incoming)).toEqual(mergeImport(existing, incoming).patch)
  })

  it('DEFAULT EQUIVALENCE holds when every checkbox is left at its own default, explicitly', () => {
    const picks = Object.fromEntries(
      mergeFieldOptions(existing, incoming).map((o) => [o.key, o.take]),
    )
    expect(applyFieldPicks(existing, incoming, picks)).toEqual(
      mergeImport(existing, incoming).patch,
    )
  })

  it("declining an ADD leaves the reader's field blank", () => {
    const patch = applyFieldPicks(existing, incoming, { subgenre: false })
    expect(patch).not.toHaveProperty('subgenre')
    expect(patch.series).toBe('Empyrean') // the other add is untouched
  })

  it('TAKE THEIRS on a both-set field lands the incoming value — impossible before this feature', () => {
    const patch = applyFieldPicks(existing, incoming, { genre: true })
    expect(patch.genre).toBe('romance')
    // and the engine alone would never produce that:
    expect(mergeImport(existing, incoming).patch).not.toHaveProperty('genre')
  })

  it('a decline and a take compose without disturbing each other', () => {
    const patch = applyFieldPicks(existing, incoming, { genre: true, subgenre: false })
    expect(patch.genre).toBe('romance')
    expect(patch).not.toHaveProperty('subgenre')
    expect(patch.series).toBe('Empyrean')
  })
})
