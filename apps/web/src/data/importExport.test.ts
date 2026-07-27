import { beforeEach, describe, expect, it, vi } from 'vitest'

// A tiny in-memory stand-in for the PostgREST client. It is NOT a PostgREST implementation — it
// understands exactly the queries importExport.ts issues, and resolves the two embedded selects
// (book_tropes→tropes, book_moods→moods) by hand. That is enough to drive the real buildBackup and
// restoreBackup end to end, which is the point: these tests assert that a reader's tropes, moods
// and followed authors come back out of a round trip, not that a hand-written plan looks right.

interface Row {
  [k: string]: unknown
}
/** The tables importExport.ts touches. A literal union (not an index signature) so the strict
 *  `noUncheckedIndexedAccess` build still sees every table as present. */
type Table =
  | 'books'
  | 'tropes'
  | 'moods'
  | 'book_tropes'
  | 'book_moods'
  | 'author_follows'
  | 'reads'
  | 'lists'
  | 'list_items'
  | 'reviews'
  | 'reading_orders'
  | 'reading_order_items'
  | 'merge_verdicts'
  | 'profiles'
type Db = Record<Table, Row[]>

const TABLES: Table[] = [
  'books', 'tropes', 'moods', 'book_tropes', 'book_moods', 'author_follows', 'reads', 'lists',
  'list_items', 'reviews', 'reading_orders', 'reading_order_items', 'merge_verdicts', 'profiles',
]

const OWNER = 'user-old'
const NEW_OWNER = 'user-new'

let db: Db
let currentUser = OWNER
let seq = 0
const uuid = () => `id-${++seq}`

/** Read a string column off an untyped fake row. */
const str = (r: Row | undefined, col: string): string => String(r?.[col] ?? '')

/** Embedded-select resolution, keyed by the exact select string the code under test uses. */
function project(table: Table, columns: string, rows: Row[]): Row[] {
  if (table === 'book_tropes' && columns.includes('tropes(')) {
    return rows.map((r) => ({
      book_id: r.book_id,
      emphasis: r.emphasis,
      tropes: db.tropes.find((t) => t.id === r.trope_id) ?? null,
    }))
  }
  if (table === 'book_moods' && columns.includes('moods(')) {
    return rows.map((r) => ({
      book_id: r.book_id,
      moods: db.moods.find((m) => m.id === r.mood_id) ?? null,
    }))
  }
  if (table === 'books' && columns.includes('book_authors(')) {
    return rows.map((r) => ({ id: r.id, book_authors: [] }))
  }
  if (table === 'reading_orders' && columns.includes('reading_order_items(')) {
    return rows.map((r) => ({ ...r, reading_order_items: [] }))
  }
  return rows
}

class Query implements PromiseLike<{ data: Row[] | Row | null; error: unknown }> {
  private filters: [string, unknown][] = []
  private columns = '*'
  private pending: Row[] | null = null
  private mode: 'select' | 'insert' | 'upsert' | 'update' = 'select'
  private patch: Row | null = null

  constructor(private table: Table) {}

  select(columns = '*') {
    this.columns = columns
    return this
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val])
    return this
  }
  insert(rows: Row | Row[]) {
    this.mode = 'insert'
    this.pending = Array.isArray(rows) ? rows : [rows]
    return this
  }
  upsert(rows: Row | Row[], _opts?: unknown) {
    this.mode = 'upsert'
    this.pending = Array.isArray(rows) ? rows : [rows]
    return this
  }
  update(patch: Row) {
    this.mode = 'update'
    this.patch = patch
    return this
  }
  single() {
    return this.run(true)
  }
  maybeSingle() {
    return this.run(true)
  }
  then<A, B>(
    onOk?: ((v: { data: Row[] | Row | null; error: unknown }) => A | PromiseLike<A>) | null,
    onErr?: ((r: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run(false).then(onOk, onErr)
  }

  private async run(single: boolean): Promise<{ data: Row[] | Row | null; error: unknown }> {
    const table = db[this.table]
    if (this.mode === 'insert' || this.mode === 'upsert') {
      const written: Row[] = (this.pending ?? []).map((r) => ({ id: r.id ?? uuid(), ...r }))
      for (const row of written) {
        // Upsert on the join tables' composite key; every other write appends.
        const dupe =
          this.mode === 'upsert'
            ? table.find((e) =>
                this.table === 'book_tropes'
                  ? e.book_id === row.book_id && e.trope_id === row.trope_id
                  : this.table === 'book_moods'
                    ? e.book_id === row.book_id && e.mood_id === row.mood_id
                    : this.table === 'author_follows'
                      ? e.user_id === row.user_id && e.author_name === row.author_name
                      : false,
              )
            : undefined
        if (dupe) Object.assign(dupe, row)
        else table.push(row)
      }
      const data = project(this.table, this.columns, written)
      return { data: single ? (data[0] ?? null) : data, error: null }
    }
    if (this.mode === 'update') {
      for (const row of table.filter((r) => this.filters.every(([c, v]) => r[c] === v))) Object.assign(row, this.patch)
      return { data: null, error: null }
    }
    const hits = project(
      this.table,
      this.columns,
      table.filter((r) => this.filters.every(([c, v]) => r[c] === v)),
    )
    return { data: single ? (hits[0] ?? null) : hits, error: null }
  }
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: currentUser } } }) },
    from: (table: string) => new Query(table as Table),
  },
}))
// Contributor persistence has its own RPC and its own tests; it is not what these assert.
vi.mock('./contributors', () => ({ persistContributors: vi.fn(async () => {}) }))

const { buildBackup, restoreBackup } = await import('./importExport')

/** A library with two books, canonical + personal tropes, a mood, and two followed authors. */
function seedOldAccount() {
  db = {
    books: [
      { id: 'book-a', owner_id: OWNER, title: 'Fourth Wing', genre: 'romance' },
      { id: 'book-b', owner_id: OWNER, title: 'Iron Flame', genre: 'romance' },
    ],
    tropes: [
      { id: 't-canon', owner_id: null, name: 'Enemies to Lovers', facet: 'dynamics' },
      { id: 't-mine', owner_id: OWNER, name: 'Dragons With Opinions', facet: 'vibe' },
    ],
    moods: [{ id: 'm-canon', owner_id: null, name: 'Devastating' }],
    book_tropes: [
      { book_id: 'book-a', trope_id: 't-canon', owner_id: OWNER, emphasis: 'pinned' },
      { book_id: 'book-a', trope_id: 't-mine', owner_id: OWNER, emphasis: 'present' },
      { book_id: 'book-b', trope_id: 't-mine', owner_id: OWNER, emphasis: 'pinned' },
    ],
    book_moods: [{ book_id: 'book-a', mood_id: 'm-canon', owner_id: OWNER }],
    author_follows: [
      { user_id: OWNER, author_name: 'Rebecca Yarros', state: 'followed' },
      { user_id: OWNER, author_name: 'A Noisy Newsletter', state: 'muted' },
    ],
    reads: [],
    lists: [],
    list_items: [],
    reviews: [],
    reading_orders: [],
    reading_order_items: [],
    merge_verdicts: [],
    profiles: [{ id: OWNER, display_name: 'Reader', skin: 'tryst' }],
  }
}

/** Wipe every owned row — what delete-account's cascade does, verified against a live database —
 *  keeping only the canonical vocabulary, which is shared and correctly survives. */
function wipeToFreshAccount({ keepCanonical = true } = {}) {
  const canonicalTropes = keepCanonical ? db.tropes.filter((t) => t.owner_id === null) : []
  const canonicalMoods = keepCanonical ? db.moods.filter((m) => m.owner_id === null) : []
  db = Object.fromEntries(TABLES.map((t) => [t, [] as Row[]])) as Db
  db.tropes = canonicalTropes
  db.moods = canonicalMoods
  db.profiles = [{ id: NEW_OWNER, display_name: '', skin: 'tryst' }]
  currentUser = NEW_OWNER
}

beforeEach(() => {
  seq = 0
  currentUser = OWNER
  seedOldAccount()
})

describe('backup round trip — the data v4 dropped on the floor', () => {
  it('carries tropes, moods and followed authors through export → restore', async () => {
    const json = await buildBackup()
    wipeToFreshAccount()

    const result = await restoreBackup(json)

    expect(result.books).toBe(2)
    expect(result.tropes).toBe(3)
    expect(result.moods).toBe(1)
    expect(result.follows).toBe(2)

    // Every assignment landed, on the NEW book ids, owned by the NEW account.
    expect(db.book_tropes).toHaveLength(3)
    expect(db.book_tropes.every((r) => r.owner_id === NEW_OWNER)).toBe(true)
    expect(db.book_tropes.some((r) => r.book_id === 'book-a')).toBe(false) // ids remapped, not reused

    const byTitle = (t: string) => str(db.books.find((b) => b.title === t), 'id')
    const tropeName = (r: Row) => str(db.tropes.find((t) => t.id === r.trope_id), 'name')
    const namesOn = (title: string) =>
      db.book_tropes.filter((r) => r.book_id === byTitle(title)).map(tropeName).sort()

    expect(namesOn('Fourth Wing')).toEqual(['Dragons With Opinions', 'Enemies to Lovers'])
    expect(namesOn('Iron Flame')).toEqual(['Dragons With Opinions'])

    // Emphasis is part of the reader's authorship — a pin must not come back as a plain present.
    const pinned = db.book_tropes.find(
      (r) => r.book_id === byTitle('Fourth Wing') && tropeName(r) === 'Enemies to Lovers',
    )
    expect(str(pinned, 'emphasis')).toBe('pinned')

    // Moods.
    expect(db.book_moods).toHaveLength(1)
    expect(str(db.moods.find((m) => m.id === db.book_moods[0]?.mood_id), 'name')).toBe('Devastating')

    // Follows, with muted still muted — the states are opposites, so a flip would be a real defect.
    expect(
      db.author_follows
        .map((f) => ({ author: str(f, 'author_name'), state: str(f, 'state') }))
        .sort((a, b) => a.author.localeCompare(b.author)),
    ).toEqual([
      { author: 'A Noisy Newsletter', state: 'muted' },
      { author: 'Rebecca Yarros', state: 'followed' },
    ])
  })

  it('re-coins the reader’s personal vocabulary, and reuses canonical rows instead of duplicating them', async () => {
    const json = await buildBackup()
    wipeToFreshAccount() // canonical survives an account deletion; the personal coinage does not

    await restoreBackup(json)

    // The canonical trope was reused, not cloned.
    const enemies = db.tropes.filter((t) => t.name === 'Enemies to Lovers')
    expect(enemies).toHaveLength(1)
    expect(enemies[0]?.owner_id).toBeNull()

    // The personal one was re-coined for the new owner, keeping its facet.
    const dragons = db.tropes.filter((t) => t.name === 'Dragons With Opinions')
    expect(dragons).toHaveLength(1)
    expect(dragons[0]?.owner_id).toBe(NEW_OWNER)
    expect(dragons[0]?.facet).toBe('vibe')
  })

  it('restores into an account with NO canonical vocabulary at all (a bare database)', async () => {
    const json = await buildBackup()
    wipeToFreshAccount({ keepCanonical: false })

    const result = await restoreBackup(json)

    expect(result.tropes).toBe(3)
    expect(result.moods).toBe(1)
    // Everything had to be coined; nothing was silently dropped for want of a vocabulary row.
    expect(db.tropes.map((t) => str(t, 'name')).sort()).toEqual(['Dragons With Opinions', 'Enemies to Lovers'])
    expect(db.moods.map((m) => str(m, 'name'))).toEqual(['Devastating'])
  })

  it('matches vocabulary case-insensitively, the way the DB unique index does', async () => {
    const json = await buildBackup()
    wipeToFreshAccount({ keepCanonical: false })
    // The new account already knows the trope, but spelled differently.
    db.tropes.push({ id: 't-other', owner_id: null, name: 'enemies TO lovers', facet: 'dynamics' })

    await restoreBackup(json)

    expect(db.tropes.filter((t) => str(t, 'name').toLowerCase() === 'enemies to lovers')).toHaveLength(1)
    expect(db.book_tropes.some((r) => r.trope_id === 't-other')).toBe(true)
  })

  it('is idempotent: restoring the same file twice does not double the assignments', async () => {
    const json = await buildBackup()
    wipeToFreshAccount()

    await restoreBackup(json)
    const tropesAfterFirst = db.book_tropes.length
    await restoreBackup(json)

    // The books duplicate (a restore is an add, by design), but no book gains a duplicate trope
    // row, and the follow list stays one row per author.
    const perBook = new Map<unknown, number>()
    for (const r of db.book_tropes) perBook.set(`${r.book_id}|${r.trope_id}`, (perBook.get(`${r.book_id}|${r.trope_id}`) ?? 0) + 1)
    expect([...perBook.values()].every((n) => n === 1)).toBe(true)
    expect(db.book_tropes.length).toBe(tropesAfterFirst * 2) // second set of books, still 1:1
    expect(db.author_follows).toHaveLength(2)
  })

  it('reads a v4 file (no tropes/moods/follows) without complaint', async () => {
    const json = await buildBackup()
    const v4 = JSON.parse(json) as Record<string, unknown>
    delete v4.tropes
    delete v4.moods
    delete v4.author_follows
    v4.v = 4
    wipeToFreshAccount()

    const result = await restoreBackup(JSON.stringify(v4))

    expect(result.books).toBe(2)
    expect(result).toMatchObject({ tropes: 0, moods: 0, follows: 0 })
    expect(db.book_tropes).toHaveLength(0)
  })

  it('exports v5 with the new sections keyed by book id', async () => {
    const parsed = JSON.parse(await buildBackup()) as {
      v: number
      tropes: Record<string, { name: string; emphasis: string }[]>
      moods: Record<string, { name: string }[]>
      author_follows: { author_name: string; state: string }[]
    }
    expect(parsed.v).toBe(5)
    expect((parsed.tropes['book-a'] ?? []).map((t) => t.name).sort()).toEqual(['Dragons With Opinions', 'Enemies to Lovers'])
    expect(parsed.moods['book-a']).toEqual([{ name: 'Devastating' }])
    expect(parsed.author_follows).toHaveLength(2)
  })
})

describe('backup round trip — hostile and partial files', () => {
  it('drops a follow whose state is neither followed nor muted rather than guessing', async () => {
    const parsed = JSON.parse(await buildBackup()) as Record<string, unknown>
    parsed.author_follows = [
      { author_name: 'Rebecca Yarros', state: 'followed' },
      { author_name: 'Someone', state: 'banished' },
      { author_name: '', state: 'followed' },
    ]
    wipeToFreshAccount()

    const result = await restoreBackup(JSON.stringify(parsed))

    expect(result.follows).toBe(1)
    expect(db.author_follows.map((f) => str(f, 'author_name'))).toEqual(['Rebecca Yarros'])
  })

  it('coerces an unknown emphasis to present, and an unknown facet to vibe', async () => {
    const parsed = JSON.parse(await buildBackup()) as {
      tropes: Record<string, { name: string; facet: string; emphasis: string }[]>
    }
    parsed.tropes['book-a'] = [{ name: 'Brand New Thing', facet: 'nonsense', emphasis: 'shouted' }]
    wipeToFreshAccount({ keepCanonical: false })

    await restoreBackup(JSON.stringify(parsed))

    const coined = db.tropes.find((t) => t.name === 'Brand New Thing')
    expect(str(coined, 'facet')).toBe('vibe')
    expect(str(db.book_tropes.find((r) => r.trope_id === coined?.id), 'emphasis')).toBe('present')
  })

  it('skips assignments for a book that did not come across, instead of failing the restore', async () => {
    const parsed = JSON.parse(await buildBackup()) as {
      tropes: Record<string, { name: string; facet: string; emphasis: string }[]>
    }
    parsed.tropes['book-that-never-existed'] = [{ name: 'Enemies to Lovers', facet: 'dynamics', emphasis: 'pinned' }]
    wipeToFreshAccount()

    const result = await restoreBackup(JSON.stringify(parsed))

    expect(result.books).toBe(2)
    expect(result.tropes).toBe(3) // the three real ones; the orphan is skipped, not thrown on
  })
})
