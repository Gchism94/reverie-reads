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
  | 'series'
  | 'series_entries'
  | 'trope_suggestions'
  | 'series_merge_decisions'
  | 'profiles'
type Db = Record<Table, Row[]>

const TABLES: Table[] = [
  'books', 'tropes', 'moods', 'book_tropes', 'book_moods', 'author_follows', 'reads', 'lists',
  'list_items', 'reviews', 'reading_orders', 'reading_order_items', 'merge_verdicts', 'series',
  'series_entries', 'trope_suggestions', 'series_merge_decisions', 'profiles',
]

const OWNER = 'user-old'
const NEW_OWNER = 'user-new'

let db: Db
let currentUser = OWNER
let seq = 0
const uuid = () => `id-${++seq}`

/** Read a string column off an untyped fake row. */
const str = (r: Row | undefined, col: string): string => String(r?.[col] ?? '')

/** Every query the code under test issued — the evidence for the coverage guard at the bottom. */
interface Access {
  table: Table
  columns: string
  mode: 'select' | 'insert' | 'upsert' | 'update'
}
let access: Access[] = []

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
  if (table === 'series_entries' && columns.includes('series(')) {
    return rows.map((r) => ({
      position: r.position, label: r.label, title: r.title, author: r.author,
      source: r.source, removed_at: r.removed_at,
      series: db.series.find((x) => x.id === r.series_id) ?? null,
    }))
  }
  if (table === 'trope_suggestions' && columns.includes('tropes(')) {
    return rows.map((r) => ({
      book_id: r.book_id, state: r.state,
      tropes: db.tropes.find((t) => t.id === r.trope_id) ?? null,
    }))
  }
  if (table === 'books' && columns.includes('book_authors(')) {
    return rows.map((r) => ({ id: r.id, book_authors: [] }))
  }
  if (table === 'reading_orders' && columns.includes('reading_order_items(')) {
    return rows.map((r) => ({
      ...r,
      reading_order_items: db.reading_order_items
        .filter((i) => i.reading_order_id === r.id)
        .map((i) => ({ position: i.position, book_id: i.book_id, series: i.series, note: i.note })),
    }))
  }
  return rows
}

class Query implements PromiseLike<{ data: Row[] | Row | null; error: unknown }> {
  private filters: [string, unknown][] = []
  private notEquals: [string, unknown][] = []
  private negated: string[] = []
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
  /** `.neq('ruling', 'same')` — the only not-equal filter the code under test uses. */
  neq(col: string, val: unknown) {
    this.notEquals.push([col, val])
    return this
  }
  /** `.not('removed_at', 'is', null)` — the only negated filter the code under test uses. */
  not(col: string, _op: string, _val: unknown) {
    this.negated.push(col)
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
    access.push({ table: this.table, columns: this.columns, mode: this.mode })
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
      table.filter(
        (r) =>
          this.filters.every(([c, v]) => r[c] === v) &&
          this.notEquals.every(([c, v]) => r[c] !== v) &&
          this.negated.every((c) => r[c] != null),
      ),
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

const { buildBackup, restoreBackup, seriesTombstones, dismissalsByBook, seriesRulingRows } = await import('./importExport')
const { BACKED_UP_TABLES, USER_OWNED_TABLES } = await import('./ownedTables')

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
    // Every other backed-up table carries at least one row, so the coverage guard below exercises
    // the real write path for each rather than passing because a section happened to be empty.
    reads: [{ id: 'r1', book_id: 'book-a', owner_id: OWNER, read_on: '2026-03-04', format: 'ebook', rating: 5, notes: 'reread' }],
    lists: [{ id: 'l1', owner_id: OWNER, name: 'Imported TBR', kind: 'tbr', is_priority: true }],
    list_items: [{ list_id: 'l1', book_id: 'book-b', owner_id: OWNER, position: 1 }],
    reviews: [{ id: 'rv1', work_key: 'w-fourth-wing', reviewer_id: OWNER, reviewer_name: 'Reader', rating: 5, body: 'Dragons.' }],
    reading_orders: [{ id: 'ro1', owner_id: OWNER, name: 'Empyrean — reading order', description: 'publication order' }],
    reading_order_items: [
      { reading_order_id: 'ro1', owner_id: OWNER, position: 1024, book_id: 'book-a', series: null, note: null },
      { reading_order_id: 'ro1', owner_id: OWNER, position: 2048, book_id: 'book-b', series: null, note: 'read after B1' },
    ],
    merge_verdicts: [{ owner_id: OWNER, book_id: 'book-a', incoming_key: 'fourth wing|yarros', verdict: 'distinct' }],
    // ── the reader's refusals ──
    series: [{ id: 'ser1', owner_id: OWNER, name: 'Empyrean' }],
    series_entries: [
      // A LIVE slot (removed_at null) — must NOT be exported; it is derived and reconciles itself.
      { id: 'se-live', series_id: 'ser1', owner_id: OWNER, position: 1, title: 'Fourth Wing', author: 'Rebecca Yarros', label: null, source: 'hardcover', book_id: 'book-a', user_edited: false, removed_at: null },
      // A TOMBSTONE — the reader deleted this slot and a refresh must never resurrect it.
      { id: 'se-dead', series_id: 'ser1', owner_id: OWNER, position: 3, title: 'Onyx Storm', author: 'Rebecca Yarros', label: 'Book 3', source: 'hardcover', book_id: null, user_edited: true, removed_at: '2026-07-01T10:00:00.000Z' },
    ],
    trope_suggestions: [
      // OPEN — a pending question, not a decision; must NOT travel.
      { book_id: 'book-a', trope_id: 't-canon', owner_id: OWNER, state: 'open', source: 'hardcover' },
      // DISMISSED — the reader waved it away; must survive.
      { book_id: 'book-b', trope_id: 't-canon', owner_id: OWNER, state: 'dismissed', source: 'hardcover' },
    ],
    series_merge_decisions: [
      // DISTINCT — the reader said no; must survive so the pair is never re-proposed.
      { id: 'smd-distinct', owner_id: OWNER, name_key_a: 'fourth wing', name_key_b: 'iron flame', ruling: 'distinct', surviving_series_id: null, alias_name: null },
      // RELATED_BUT_SEPARATE — siblings, not duplicates; also a refusal-to-merge and must travel.
      { id: 'smd-siblings', owner_id: OWNER, name_key_a: 'mountain men', name_key_b: 'mountain men matchmaker', ruling: 'related_but_separate', surviving_series_id: null, alias_name: null },
      // SAME — already reflected in the merged books/series_entries data; must NOT travel (its
      // surviving_series_id can't be remapped onto the new account's regenerated series ids).
      { id: 'smd-same', owner_id: OWNER, name_key_a: 'acotar', name_key_b: 'a court of thorns and roses', ruling: 'same', surviving_series_id: 'ser1', alias_name: 'ACOTAR' },
    ],
    profiles: [{ id: OWNER, display_name: 'Reader', skin: 'tryst' }],
  }
  // A PERSONAL mood too, so the mood-coining write path is covered like the trope one.
  db.moods.push({ id: 'm-mine', owner_id: OWNER, name: 'Unhinged In A Good Way' })
  db.book_moods.push({ book_id: 'book-b', mood_id: 'm-mine', owner_id: OWNER })
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
  access = []
  seedOldAccount()
})

describe('backup round trip — the data v4 dropped on the floor', () => {
  it('carries tropes, moods and followed authors through export → restore', async () => {
    const json = await buildBackup()
    wipeToFreshAccount()

    const result = await restoreBackup(json)

    expect(result.books).toBe(2)
    expect(result.tropes).toBe(3)
    expect(result.moods).toBe(2)
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

    // Moods — the canonical one and the reader's own coinage.
    expect(db.book_moods).toHaveLength(2)
    const moodNameFor = (title: string) =>
      db.book_moods
        .filter((r) => r.book_id === byTitle(title))
        .map((r) => str(db.moods.find((m) => m.id === r.mood_id), 'name'))
    expect(moodNameFor('Fourth Wing')).toEqual(['Devastating'])
    expect(moodNameFor('Iron Flame')).toEqual(['Unhinged In A Good Way'])

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
    expect(result.moods).toBe(2)
    // Everything had to be coined; nothing was silently dropped for want of a vocabulary row.
    expect(db.tropes.map((t) => str(t, 'name')).sort()).toEqual(['Dragons With Opinions', 'Enemies to Lovers'])
    expect(db.moods.map((m) => str(m, 'name')).sort()).toEqual(['Devastating', 'Unhinged In A Good Way'])
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

    // TOMBSTONES DO NOT DOUBLE. Unlike the join tables, series_entries has a synthetic PK and the
    // parent series is resolved BY NAME rather than recreated, so the second restore used to append
    // a byte-identical second tombstone to the same series at the same position.
    expect(db.series_entries).toHaveLength(1)
    const slots = db.series_entries.map((r) => `${str(r, 'series_id')}@${r.position}`)
    expect(new Set(slots).size).toBe(slots.length)
    expect(db.series).toHaveLength(1) // and the parent series was reused, not duplicated

    // Dismissals DO get a row per restored book copy — that is the same additive semantics as
    // book_tropes (each restore makes new books), not a duplicate: the (book_id, trope_id) key is
    // distinct every time. Asserted rather than assumed, since the two tables differ here.
    expect(db.trope_suggestions).toHaveLength(2)
    const perSuggestion = new Set(db.trope_suggestions.map((r) => `${str(r, 'book_id')}|${str(r, 'trope_id')}`))
    expect(perSuggestion.size).toBe(2)
  })

  it('a tombstone is not added beside a LIVE slot the account already has at that position', async () => {
    const json = await buildBackup()
    wipeToFreshAccount()
    // The new account re-added the book the backup says was removed — a later decision than the
    // backup's, so it must win.
    db.series.push({ id: 'ser-new', owner_id: NEW_OWNER, name: 'Empyrean' })
    db.series_entries.push({
      id: 'se-live-new', series_id: 'ser-new', owner_id: NEW_OWNER, position: 3,
      title: 'Onyx Storm', author: 'Rebecca Yarros', book_id: 'some-book', user_edited: false, removed_at: null,
    })

    const result = await restoreBackup(json)

    expect(result.tombstones).toBe(0)
    expect(db.series_entries).toHaveLength(1)
    expect(db.series_entries[0]?.removed_at).toBeNull()
  })

  it('dedupes repeated slots WITHIN a single hand-edited file', async () => {
    const parsed = JSON.parse(await buildBackup()) as { series_tombstones: unknown[] }
    parsed.series_tombstones = [parsed.series_tombstones[0], parsed.series_tombstones[0]]
    wipeToFreshAccount()

    const result = await restoreBackup(JSON.stringify(parsed))

    expect(result.tombstones).toBe(1)
    expect(db.series_entries).toHaveLength(1)
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

  it('a v5 archive carrying reading_orders restores everything else, ignoring that key', async () => {
    // Reading orders were dropped (chore/drop-reading-orders): the app stopped touching those
    // tables in S1 and they go in S2. Archives made BEFORE that still carry the key, and a reader
    // restoring one must not meet an error over a subsystem that no longer exists — the key is
    // skipped, and nothing else is disturbed.
    //
    // Hand-built rather than round-tripped, precisely because buildBackup no longer emits the key:
    // an archive produced today could not exercise this path at all.
    const parsed = JSON.parse(await buildBackup()) as Record<string, unknown>
    expect(parsed.reading_orders, 'a current export must not write the key at all').toBeUndefined()

    parsed.reading_orders = [
      {
        name: 'Empyrean — reading order',
        description: 'publication order',
        reading_order_items: [
          { position: 1024, book_id: 'book-a', series: null, note: null },
          { position: 2048, book_id: 'book-b', series: null, note: 'read after B1' },
          { position: 3072, book_id: null, series: 'Crescent City', note: null },
        ],
      },
    ]
    wipeToFreshAccount()

    const result = await restoreBackup(JSON.stringify(parsed))

    // Everything else lands intact…
    expect(result.books).toBe(2)
    expect(db.books).toHaveLength(2)
    expect(db.reads.length).toBeGreaterThan(0)
    expect(db.lists.length).toBeGreaterThan(0)
    expect(db.book_tropes.length).toBeGreaterThan(0)
    expect(db.series_entries.length).toBeGreaterThan(0) // the refusals survive too

    // …and not one reading-order row is written.
    expect(db.reading_orders, 'the dropped subsystem must not be recreated').toHaveLength(0)
    expect(db.reading_order_items).toHaveLength(0)
  })

  it('an archive carrying plan_date restores cleanly, ignoring the key, with the trio intact', async () => {
    // Same contract as reading_orders above, one structural step harder. That was a top-level key
    // nothing read; plan_date is a COLUMN inside every book row, carried into the archive by the
    // export's `select('*')` and previously written straight back by the restore spread. It has to
    // be STRIPPED, not merely skipped.
    //
    // The failure this prevents lands on the NEXT branch, not this one: once the column is dropped,
    // an insert still carrying the key makes PostgREST reject the row and takes the whole restore
    // down with it. So the assertion is not "the plan survives" — it is "the key never reaches the
    // insert", which is what stays true after the column is gone.
    const parsed = JSON.parse(await buildBackup()) as { books: Record<string, unknown>[] }

    // Hand-planted: a current export cannot produce this, because nothing writes plan_date anymore.
    // The trio and the legacy column deliberately DISAGREE, so a restore that wrote plan_date back
    // could not be mistaken for one that merely carried the trio through.
    parsed.books = parsed.books.map((b) => ({
      ...b,
      plan_date: '2019-01-01',
      plan_y: 2026,
      plan_m: 3,
      plan_d: null,
    }))
    wipeToFreshAccount()

    const result = await restoreBackup(JSON.stringify(parsed))

    // It restores rather than throwing — the archive predates the drop and must still be readable.
    expect(result.books).toBe(2)
    expect(db.books).toHaveLength(2)

    // The key never reaches the insert. This is the assertion that survives the column drop, and
    // the one a "silently write it back" implementation fails.
    for (const b of db.books) {
      expect(Object.keys(b), 'plan_date must be stripped before the insert').not.toContain('plan_date')
    }

    // …and the plan itself came through, from the trio, at the precision it was stored at.
    for (const b of db.books) {
      expect(b).toMatchObject({ plan_y: 2026, plan_m: 3, plan_d: null })
    }
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

// ── the structural guard: the registry must describe what the code actually does ──
//
// ownedTables.test.ts proves nothing user-owned escapes the registry and that deletion cascades to
// all of it. This half proves the other direction: a table declared `backup: true` is genuinely
// read by buildBackup AND written by restoreBackup. Together they close the v4 gap — a new
// user-owned table cannot be added without a written decision, and a decision to back it up cannot
// be left unimplemented.
describe('backup coverage matches the ownedTables registry', () => {
  /** Drive a full export → restore and report every table the two touched. */
  async function recordFullCycle() {
    const json = await buildBackup()
    const reads = access.filter((a) => a.mode === 'select')
    access = []
    wipeToFreshAccount()
    await restoreBackup(json)
    const writes = access.filter((a) => a.mode !== 'select')
    return { reads, writes }
  }

  it('every table declared backup:true is read by buildBackup and written by restoreBackup', async () => {
    const { reads, writes } = await recordFullCycle()
    const readTables = new Set<string>(reads.map((a) => a.table))
    const writtenTables = new Set<string>(writes.map((a) => a.table))

    const missing: string[] = []
    for (const entry of BACKED_UP_TABLES) {
      const plan = entry.plan as { backup: true; via?: string }
      if (plan.via) {
        // Read through a parent's embedded select (PostgREST `parent(child(...))`).
        const embedded = reads.some((a) => a.table === plan.via && a.columns.includes(`${entry.table}(`))
        if (!embedded) missing.push(`${entry.table} (not embedded in a ${plan.via} select)`)
      } else if (!readTables.has(entry.table)) {
        missing.push(`${entry.table} (never read by buildBackup)`)
      }
      if (!writtenTables.has(entry.table)) missing.push(`${entry.table} (never written by restoreBackup)`)
    }

    expect(
      missing,
      'Declared backup:true in ownedTables.ts but not actually carried by the backup. Either wire ' +
        'it into buildBackup/restoreBackup, or change its plan to backup:false with a reason.',
    ).toEqual([])
  })

  it('the three tables v4 dropped are all declared backup:true', () => {
    // The regression that started this. Named explicitly so a future edit that quietly flips one
    // back to backup:false has to argue with a test rather than slip through a diff.
    for (const t of ['book_tropes', 'book_moods', 'author_follows']) {
      const entry = USER_OWNED_TABLES.find((e) => e.table === t)
      expect(entry, `${t} vanished from the registry`).toBeDefined()
      expect(entry!.plan.backup, `${t} must be backed up — v4 dropping it is the bug this guards`).toBe(true)
    }
  })
})

// ── the refusals: negative space that must survive a round trip ──
describe('backup round trip — the reader’s refusals', () => {
  it('a removed series slot stays removed, and a live slot is not exported', async () => {
    const parsed = JSON.parse(await buildBackup()) as {
      series_tombstones: { series: string; position: number; title: string; removed_at: string }[]
    }
    // Only the tombstone travels. Exporting the live slot would restore a DERIVED row as if it
    // were authored, and the series shelf rebuilds those on its own.
    expect(parsed.series_tombstones).toHaveLength(1)
    expect(parsed.series_tombstones[0]).toMatchObject({ series: 'Empyrean', position: 3, title: 'Onyx Storm' })

    wipeToFreshAccount()
    const result = await restoreBackup(JSON.stringify(parsed))

    expect(result.tombstones).toBe(1)
    // The parent series was materialized so the tombstone has somewhere to live.
    const series = db.series.find((x) => str(x, 'name') === 'Empyrean')
    expect(series).toBeDefined()
    expect(str(series, 'owner_id')).toBe(NEW_OWNER)

    expect(db.series_entries).toHaveLength(1)
    const dead = db.series_entries[0]!
    expect(str(dead, 'series_id')).toBe(str(series, 'id'))
    expect(dead.removed_at).toBe('2026-07-01T10:00:00.000Z')
    // A tombstone is by definition an unlinked slot the reader touched.
    expect(dead.book_id).toBeNull()
    expect(dead.user_edited).toBe(true)
    expect(str(dead, 'title')).toBe('Onyx Storm')
    expect(dead.position).toBe(3)
  })

  it('a dismissed trope suggestion stays dismissed, and an open one does not travel', async () => {
    const parsed = JSON.parse(await buildBackup()) as { trope_dismissals: Record<string, string[]> }
    // book-b's dismissal travels; book-a's OPEN suggestion is a question the catalog may ask again.
    expect(parsed.trope_dismissals).toEqual({ 'book-b': ['Enemies to Lovers'] })

    wipeToFreshAccount()
    const result = await restoreBackup(JSON.stringify(parsed))

    expect(result.dismissals).toBe(1)
    expect(db.trope_suggestions).toHaveLength(1)
    const row = db.trope_suggestions[0]!
    expect(row.state).toBe('dismissed')
    expect(str(row, 'owner_id')).toBe(NEW_OWNER)
    // Resolved by NAME onto the new account's canonical trope, and onto the new book id.
    expect(str(row, 'trope_id')).toBe(str(db.tropes.find((t) => str(t, 'name') === 'Enemies to Lovers'), 'id'))
    expect(str(row, 'book_id')).toBe(str(db.books.find((b) => str(b, 'title') === 'Iron Flame'), 'id'))
  })

  it('skips a dismissal whose trope exists in no vocabulary rather than coining one for a refusal', async () => {
    const parsed = JSON.parse(await buildBackup()) as {
      trope_dismissals: Record<string, string[]>
      tropes: Record<string, unknown>
    }
    parsed.trope_dismissals = { 'book-b': ['A Trope Nobody Has'] }
    parsed.tropes = {} // and it is not assigned anywhere either, so nothing coins it
    wipeToFreshAccount({ keepCanonical: false })

    const result = await restoreBackup(JSON.stringify(parsed))

    expect(result.dismissals).toBe(0)
    expect(db.tropes).toHaveLength(0) // no vocabulary invented out of a rejection
  })

  it('drops a tombstone whose series name is missing rather than orphaning it', async () => {
    const parsed = JSON.parse(await buildBackup()) as { series_tombstones: { series: string }[] }
    parsed.series_tombstones = [{ series: '   ' } as { series: string }]
    wipeToFreshAccount()

    const result = await restoreBackup(JSON.stringify(parsed))

    expect(result.tombstones).toBe(0)
    expect(db.series_entries).toHaveLength(0)
  })

  it('a "distinct"/"related_but_separate" series ruling survives, and a "same" ruling does not travel', async () => {
    const parsed = JSON.parse(await buildBackup()) as {
      series_merge_decisions: { name_key_a: string; name_key_b: string; ruling: string }[]
    }
    // 'same' is excluded server-side (buildBackup's .neq) — only the two refusals travel.
    expect(parsed.series_merge_decisions).toHaveLength(2)
    expect(parsed.series_merge_decisions.map((r) => r.ruling).sort()).toEqual(['distinct', 'related_but_separate'])

    wipeToFreshAccount()
    await restoreBackup(JSON.stringify(parsed))

    expect(db.series_merge_decisions).toHaveLength(2)
    expect(db.series_merge_decisions.every((r) => str(r, 'owner_id') === NEW_OWNER)).toBe(true)
    const distinct = db.series_merge_decisions.find((r) => str(r, 'ruling') === 'distinct')
    expect(distinct).toMatchObject({ name_key_a: 'fourth wing', name_key_b: 'iron flame' })
    const siblings = db.series_merge_decisions.find((r) => str(r, 'ruling') === 'related_but_separate')
    expect(siblings).toMatchObject({ name_key_a: 'mountain men', name_key_b: 'mountain men matchmaker' })
  })
})

// The round-trip tests above cannot catch OVER-capture in these two shapers: the queries filter
// server-side (`.not('removed_at','is',null)` / `.eq('state','dismissed')`), so a live row never
// reaches them through that path. Mutation-testing showed exactly that blind spot — widening either
// shaper left the suite green. These exercise the functions directly, with mixed input, so the
// "only the refusal travels" rule is guarded on its own and not just by the query.
describe('refusal shapers reject the positive half on their own', () => {
  it('seriesTombstones keeps only rows with a removed_at', () => {
    const rows = [
      { position: 1, label: null, title: 'Live', author: 'A', source: 'hardcover', removed_at: null, series: { name: 'S' } },
      { position: 3, label: 'B3', title: 'Dead', author: 'A', source: 'hardcover', removed_at: '2026-07-01T00:00:00.000Z', series: { name: 'S' } },
      // a tombstone whose series row didn't come back — unkeyable, so it is dropped
      { position: 4, label: null, title: 'Orphan', author: 'A', source: 'manual', removed_at: '2026-07-02T00:00:00.000Z', series: null },
    ] as unknown as Parameters<typeof seriesTombstones>[0]
    expect(seriesTombstones(rows).map((t) => t.title)).toEqual(['Dead'])
  })

  it('dismissalsByBook keeps only dismissed suggestions', () => {
    const rows = [
      { book_id: 'b1', state: 'open', tropes: { name: 'Open One' } },
      { book_id: 'b1', state: 'dismissed', tropes: { name: 'Waved Away' } },
      { book_id: 'b2', state: 'dismissed', tropes: null },
    ] as unknown as Parameters<typeof dismissalsByBook>[0]
    expect(dismissalsByBook(rows)).toEqual({ b1: ['Waved Away'] })
  })

  it('seriesRulingRows drops "same" even when fed one directly, canonicalizes pair order, and dedupes', () => {
    const rows = [
      // 'same' must be dropped here too — buildBackup's server-side .neq is not the only guard.
      { name_key_a: 'acotar', name_key_b: 'a court of thorns and roses', ruling: 'same' },
      // out of alphabetical order — must come back canonicalized (a <= b)
      { name_key_a: 'iron flame', name_key_b: 'fourth wing', ruling: 'distinct' },
      // a duplicate of the same pair, keys reversed — a real upsert would fail on this twice in
      // one statement, so only one row may survive
      { name_key_a: 'fourth wing', name_key_b: 'iron flame', ruling: 'distinct' },
      { name_key_a: 'mountain men', name_key_b: 'mountain men matchmaker', ruling: 'related_but_separate' },
      // unkeyable — dropped rather than restored with an empty key
      { name_key_a: '', name_key_b: 'iron flame', ruling: 'distinct' },
    ] as unknown as Parameters<typeof seriesRulingRows>[0]
    const out = seriesRulingRows(rows, NEW_OWNER)
    expect(out).toEqual([
      { owner_id: NEW_OWNER, name_key_a: 'fourth wing', name_key_b: 'iron flame', ruling: 'distinct' },
      { owner_id: NEW_OWNER, name_key_a: 'mountain men', name_key_b: 'mountain men matchmaker', ruling: 'related_but_separate' },
    ])
  })
})
