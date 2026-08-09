import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  matchEntryForBook,
  seriesNameKey,
  mergeSourceEntries,
  seedSeriesPositions,
  sortEntries,
  unlinkedEntries,
  type Book,
  type SeriesEntry,
  type SeriesStatus,
} from '@reverie/core'
import { supabase } from '../lib/supabase'
import { booksKey } from './books'
import { allListItemsKey } from './listItems'

/**
 * Series + series_entries — the series-membership relation behind the series page (the page IS
 * the reading order). Series are identified by NAME app-wide (books carry a series string); the
 * row is created lazily the first time a series is opened, and RECONCILED against the library:
 * every book naming this series gets an entry, ghosts adopt matching imports. Source (Hardcover)
 * data only ever FILLS GAPS — a user_edited entry is never touched, and `user_edited` means a
 * READER placed the row, never that reconciliation created it.
 *
 * REMOVAL means one thing on both surfaces (book page and series page): the slot is gone and the
 * book stops naming the series. It is a SOFT delete — the row survives with `removed_at` stamped —
 * because a canonical source refresh would otherwise re-insert the ghost the reader just dismissed.
 * Tombstones are invisible to every read below; only the source merge is shown them.
 */

export interface UiSeries {
  id: string
  name: string
  status: SeriesStatus | null
  source: 'manual' | 'hardcover'
  sourceRef: string | null
  refreshedAt: string | null
}

interface SeriesRowT {
  id: string
  owner_id: string
  name: string
  status: string | null
  source: string
  source_ref: string | null
  refreshed_at: string | null
}

interface SeriesEntryRowT {
  id: string
  series_id: string
  position: number | string
  label: string | null
  title: string
  author: string
  book_id: string | null
  source: string
  user_edited: boolean
  removed_at: string | null
}

export interface SeriesDetail {
  series: UiSeries
  entries: SeriesEntry[]
  /** Slots the reader removed. Never rendered — carried so a source refresh can't resurrect them. */
  removed: SeriesEntry[]
}

/**
 * The patch that retires a slot. `book_id → null` frees the (series_id, book_id) unique index for a
 * later re-add, and `user_edited` keeps the source merge from trying to reposition a tombstone.
 *
 * `remove_series_entry` (20260731010000) writes this same shape in SQL, because that path also has to
 * clear `books.series` in the same transaction. The two must stay in step: change one and change the
 * other. Only `useSyncBookSeries` still uses this TS copy — `useRemoveEntry` goes through the RPC.
 */
const removalPatch = () => ({ removed_at: new Date().toISOString(), book_id: null, user_edited: true })

const toUiSeries = (row: SeriesRowT): UiSeries => ({
  id: row.id,
  name: row.name,
  status: (row.status as SeriesStatus) ?? null,
  source: row.source === 'hardcover' ? 'hardcover' : 'manual',
  sourceRef: row.source_ref,
  refreshedAt: row.refreshed_at,
})

const toEntry = (row: SeriesEntryRowT): SeriesEntry => ({
  id: row.id,
  position: Number(row.position) || 0,
  label: row.label,
  title: row.title,
  author: row.author,
  bookId: row.book_id,
  source: row.source === 'hardcover' ? 'hardcover' : 'manual',
  userEdited: row.user_edited,
})

export const seriesKey = (name: string) => ['series', name.toLowerCase()] as const
export const seriesListKey = ['seriesList'] as const

const splitName = (full: string): { first: string; last: string } => {
  const parts = full.trim().split(/\s+/)
  if (parts.length <= 1) return { first: '', last: parts[0] ?? '' }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] ?? '' }
}

async function ownerId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error('Not signed in')
  return id
}

/**
 * Every series row with its entries — the library Series strips' overlay, and the /series index's
 * whole read.
 *
 * WIDENED for the index (feat/series-builder), additively: the entry select carries the full row
 * rather than three columns, and the `removed_at is null` filter is gone so tombstones can be
 * COUNTED here instead of needing a second query. `total` and `ghosts` still mean live-only, exactly
 * as before — `SeriesView` reads `total` and nothing else, so its behaviour is unchanged.
 *
 * READ-ONLY, and that is load-bearing. `useSeriesDetail` reconciles the library into `series_entries`
 * as a side effect of reading, which is right for one series the reader opened and would be a write
 * storm across every series on an index page load. The index renders what exists; expanding a row
 * mounts `useSeriesDetail` for that one series, which materializes it on a deliberate gesture.
 */
export interface SeriesListRow {
  series: UiSeries
  /** live entries */
  total: number
  /** live entries with no linked book */
  ghosts: number
  /** tombstones — removed slots, invisible to every other read */
  removed: number
  /** live entries in reading order */
  entries: SeriesEntry[]
}

export function useSeriesList() {
  return useQuery({
    queryKey: seriesListKey,
    queryFn: async (): Promise<Map<string, SeriesListRow>> => {
      const [{ data: rows, error }, { data: ents, error: e2 }] = await Promise.all([
        supabase.from('series').select('*'),
        supabase.from('series_entries').select('*'),
      ])
      if (error) throw error
      if (e2) throw e2
      const byId = new Map<string, SeriesListRow>()
      for (const r of (rows ?? []) as SeriesRowT[])
        byId.set(r.id, { series: toUiSeries(r), total: 0, ghosts: 0, removed: 0, entries: [] })
      for (const e of (ents ?? []) as SeriesEntryRowT[]) {
        const s = byId.get(e.series_id)
        if (!s) continue
        if (e.removed_at) {
          s.removed++
          continue
        }
        s.total++
        if (!e.book_id) s.ghosts++
        s.entries.push(toEntry(e))
      }
      const byName = new Map<string, SeriesListRow>()
      for (const v of byId.values()) {
        v.entries = sortEntries(v.entries)
        byName.set(v.series.name.toLowerCase(), v)
      }
      return byName
    },
  })
}

/**
 * The series page's query: find-or-create the row by name, reconcile the library into the
 * entries (idempotent — safe to re-run), return the detail. Library books naming this series
 * always have an entry.
 *
 * Seeded entries are NOT user data and are written `user_edited: false`, so a source refresh may
 * still correct their positions. They become the reader's the moment the reader moves one. The
 * comment here used to claim the opposite ("their arranged positions are USER data"), which is how
 * the defect read as intentional for four months.
 */
export function useSeriesDetail(name: string) {
  return useQuery({
    queryKey: seriesKey(name),
    enabled: !!name.trim(),
    queryFn: async (): Promise<SeriesDetail> => {
      const uid = await ownerId()
      const { data: rows, error } = await supabase.from('series').select('*').eq('name', name).limit(1)
      if (error) throw error
      let row = (rows as SeriesRowT[])[0]
      if (!row) {
        // ── TIER 1 PREVENTION (fix/series-consolidation) ────────────────────────────────────────
        // Before minting a row, look for one whose NORMALIZED name already matches. Lazy
        // find-or-create with an exact-name lookup is what generates duplicates: the series
        // backfill rewrote `books.series` to long parsed forms, so opening a page under the old
        // short name found nothing and minted a permanent second record. The ACOTAR row was born
        // that way, minutes before the screenshots that reported it.
        //
        // REFUSING TO CREATE DESTROYS NOTHING, which is the whole reason this half is safe to
        // automate while merging is not. This branch cannot merge, rename or delete: it only
        // decides whether an INSERT happens, and every row that already exists is untouched.
        //
        // `seriesNameKey` collapses only the same name written differently (case, punctuation, a
        // leading article, a trailing "Series"). It deliberately does NOT match initialisms —
        // ACOTAR is not prevented here — because that is an identity judgment and belongs in a
        // queued proposal, not an automatic path (see the key's own note).
        const { data: allRows, error: aErr } = await supabase.from('series').select('*')
        if (aErr) throw aErr
        const key = seriesNameKey(name)
        row = ((allRows ?? []) as SeriesRowT[]).find((r) => seriesNameKey(r.name) === key) as
          | SeriesRowT
          | undefined
        if (!row) {
          const { data: created, error: cErr } = await supabase
            .from('series')
            .insert({ owner_id: uid, name })
            .select()
            .single()
          if (cErr) throw cErr
          row = created as SeriesRowT
        }
      }
      const seriesRow: SeriesRowT = row
      // The books this page reconciles are the ones naming the SURVIVING row, not the name in the
      // URL. When the guard above returned a near-match, those differ — and keying off the URL name
      // would seed the other name's books as entries INTO this record, which is a membership merge
      // performed silently by a page view. Merging is PR 2's job and has to preserve ghosts,
      // tombstones and positions deliberately; this PR reads what the row already owns and writes
      // no cross-name membership. A reader who opens the variant name therefore sees the surviving
      // series page, and books still filed under the variant name stay visible in the Library's
      // Series view until that merge lands.
      const reconcileName = seriesRow.name

      const [{ data: entRows, error: eErr }, { data: libRows, error: bErr }] = await Promise.all([
        // ORDERED, deliberately. Revive used to take the FIRST same-title tombstone out of whatever
        // order Postgres happened to return, so with two candidates the winner could differ between
        // runs — a bug that cannot be reproduced reliably is a bug that survives investigation.
        // `position` is the reader's own arrangement and the only field with meaning here; `id`
        // breaks the remaining tie so the sequence is total rather than merely mostly-stable.
        supabase
          .from('series_entries')
          .select('*')
          .eq('series_id', seriesRow.id)
          .order('position', { ascending: true })
          .order('id', { ascending: true }),
        // Deterministic order matters: these rows SEED the reading order, and an unordered fetch
        // made a null-position library number itself by whatever order Postgres happened to return.
        // Numbered books first (ascending), then the unnumbered ones alphabetically.
        supabase
          .from('books')
          .select('id, title, author_first, author_last, position, status')
          .eq('series', reconcileName)
          .order('position', { ascending: true, nullsFirst: false })
          .order('title', { ascending: true }),
      ])
      if (eErr) throw eErr
      if (bErr) throw bErr
      const allRows = (entRows ?? []) as SeriesEntryRowT[]
      let entries = allRows.filter((r) => !r.removed_at).map(toEntry)
      const removed = allRows.filter((r) => r.removed_at).map(toEntry)
      const lib = (libRows ?? []) as { id: string; title: string; author_first: string | null; author_last: string | null; position: number | null; status: string | null }[]

      // 1) ghosts adopt matching library books (an import landed after the ghost was seeded).
      //
      //    WHICH ghost is `matchEntryForBook`'s call — the same rule revive uses below, because it is
      //    the same question. Adopting the wrong ghost links the book to a slot meant for a different
      //    edition AND consumes the book from `linked`, so the corrected revive pass beneath this one
      //    never gets a say: an earlier step that guesses can override a later step that doesn't.
      //    An undiscriminatable tie therefore adopts nothing and lets the book fall through.
      //
      //    `unlinkedEntries` is load-bearing, not decoration: it is the `bookId == null` guard that
      //    used to live inside `ghostMatchesBook`. Without it a book could claim an entry that
      //    already belongs to a DIFFERENT book, re-pointing that entry and orphaning the first
      //    book's slot.
      const linked = new Set(entries.filter((e) => e.bookId).map((e) => e.bookId as string))
      for (const b of lib) {
        if (linked.has(b.id)) continue
        const match = matchEntryForBook(unlinkedEntries(entries), {
          title: b.title,
          first: b.author_first ?? '',
          last: b.author_last ?? '',
        })
        if (match.kind !== 'match') continue
        const ghost = entries.find((e) => e.id === match.entry.id)
        if (!ghost) continue
        await supabase.from('series_entries').update({ book_id: b.id }).eq('id', ghost.id)
        ghost.bookId = b.id
        linked.add(b.id)
      }
      // 2) every library book naming this series gets an entry. A book that names the series is the
      //    reader asking for it back, so a matching tombstone REVIVES rather than blocking — removal
      //    outlives a source refresh, not a deliberate re-add.
      //
      //    WHICH tombstone is `matchEntryForBook`'s call, not this loop's: title first, author
      //    only to break a tie between same-title tombstones, and nothing revived when the tie can't
      //    be broken. Reviving the wrong slot resurrects a removal the reader made deliberately, in
      //    the reading order, silently — strictly worse than a missed revive they can see and redo.
      //    A tombstone this refuses stays a tombstone, so the book falls through to `fresh` below and
      //    gets a NEW slot: the reader sees their book in the series either way.
      const joining = lib.filter((b) => !linked.has(b.id))
      // Tombstones are consumed as they revive, so two same-title books can't both claim one slot.
      const available = [...removed]
      for (const b of joining) {
        const bookLike = { title: b.title, first: b.author_first ?? '', last: b.author_last ?? '' }
        const match = matchEntryForBook(available, bookLike)
        if (match.kind !== 'match') continue
        const t = match.entry
        const { data: back } = await supabase
          .from('series_entries')
          .update({ removed_at: null, book_id: b.id })
          .eq('id', t.id)
          .select()
        const row = ((back ?? []) as SeriesEntryRowT[])[0]
        if (row) entries = [...entries, toEntry(row)]
        available.splice(
          available.findIndex((x) => x.id === t.id),
          1,
        )
        linked.add(b.id)
      }
      // Positions come from the core seeder, not raw books.position: imports park global-order
      // numbers there (412, 1290) and seeding those verbatim is what made positions look random.
      const fresh = joining.filter((b) => !linked.has(b.id))
      const seeded = seedSeriesPositions(
        fresh.map((b) => ({ id: b.id, title: b.title, position: b.position })),
        Math.max(0, ...entries.map((e) => e.position)),
      )
      // `?? 0` was a collision generator, flagged by the Phase 1 migration and fixed here: every
      // book the seeder had no answer for landed on slot 0 together, so the first took it and the
      // rest duplicated it — invisibly before Phase 2, and as a rejected insert once
      // series_entries_position_uidx lands. A book with no known place goes to the END instead,
      // one slot each, which is the rule the cleared-number and source-insert paths already follow.
      let seedFallback = Math.floor(Math.max(0, ...entries.map((e) => e.position), ...seeded.values()))
      const inserts = fresh.map((b) => ({
        series_id: seriesRow.id,
        owner_id: uid,
        position: seeded.get(b.id) ?? ++seedFallback,
        title: b.title,
        author: [b.author_first, b.author_last].filter(Boolean).join(' '),
        book_id: b.id,
        source: 'manual',
        // MACHINE SEEDING IS NOT A READER GESTURE. This wrote `true` from ab9e1fe (#77) until
        // fix/series-seed-provenance, which made every row reconciliation ever created permanently
        // immune to `mergeSourceEntries` — so "Fetch series data" could not correct a position on
        // any series whose page had been opened once. These positions come from
        // `seedSeriesPositions`, a heuristic over `books.position`; they are exactly the numbers a
        // catalog fetch SHOULD be allowed to replace. A reader who then drags this row writes
        // `true` through `useMoveEntry`, and from that moment the source can no longer touch it.
        user_edited: false,
      }))
      if (inserts.length) {
        const { data: added, error: iErr } = await supabase.from('series_entries').insert(inserts).select()
        if (iErr) throw iErr
        entries = [...entries, ...((added ?? []) as SeriesEntryRowT[]).map(toEntry)]
      }
      // 3) series-level status: seed once from the books' own status field
      if (!seriesRow.status) {
        const votes = lib.map((b) => b.status).filter((s) => s && s !== 'standalone')
        const seed = votes[0]
        if (seed) {
          await supabase.from('series').update({ status: seed }).eq('id', seriesRow.id)
          Object.assign(seriesRow, { status: seed })
        }
      }
      return { series: toUiSeries(seriesRow), entries: sortEntries(entries), removed }
    },
  })
}

/** Read-only peek for the book-detail strip and the chain prompt — never creates rows. */
export async function fetchSeriesEntries(name: string): Promise<SeriesEntry[] | null> {
  const { data: rows } = await supabase.from('series').select('id').eq('name', name).limit(1)
  const row = (rows ?? [])[0] as { id: string } | undefined
  if (!row) return null
  const { data: ents } = await supabase.from('series_entries').select('*').eq('series_id', row.id).is('removed_at', null)
  return sortEntries(((ents ?? []) as SeriesEntryRowT[]).map(toEntry))
}

function useSeriesInvalidate(name: string) {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: seriesKey(name) })
    void qc.invalidateQueries({ queryKey: seriesListKey })
  }
}

export function useUpdateSeries(name: string) {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The series' },
    mutationFn: async (input: { id: string; name?: string; status?: SeriesStatus | null }) => {
      const patch: Record<string, unknown> = {}
      if (input.name !== undefined) patch.name = input.name
      if (input.status !== undefined) patch.status = input.status
      const { error } = await supabase.from('series').update(patch).eq('id', input.id)
      if (error) throw error
      // a rename re-points every library book that carried the old series string
      if (input.name !== undefined && input.name !== name) {
        const { error: bErr } = await supabase.from('books').update({ series: input.name }).eq('series', name)
        if (bErr) throw bErr
      }
    },
    onSuccess: (_d, input) => {
      void qc.invalidateQueries({ queryKey: seriesKey(name) })
      if (input.name) void qc.invalidateQueries({ queryKey: seriesKey(input.name) })
      void qc.invalidateQueries({ queryKey: seriesListKey })
      void qc.invalidateQueries({ queryKey: booksKey })
    },
  })
}

/**
 * A slot write: which entry, where it lands, and optionally a new label.
 *
 * `bookId` is deliberately ABSENT. It used to ride along on every move so the client could mirror
 * the position onto `books.position` itself; `set_series_order` reads it from the entry row inside
 * the transaction instead, which is the only way the mirror can't be pointed at the wrong book by
 * a stale cache. Nothing here needs to know a book id to move a slot.
 */
export interface SeriesSlot {
  entryId: string
  position: number
  label?: string | null
}

interface SeriesOrderResult {
  moved: number
  skipped_user_edited: number
  books_synced: number
  length_set: boolean
  length_books_synced: number
}

/**
 * THE ONE WRITE PATH for series position and series length (`set_series_order`, 20260814010000).
 *
 * Everything that moves a slot or sets a length goes through here. Before Phase 2 this was spread
 * across a per-row update loop, a `books.position` mirror issued as a separate statement
 * (`syncBookPosition`), and a `books.series_count` write buried in the book patch — three writers
 * for two facts, none of them transactional with the others. docs/audits/series-count-schema.md §5
 * named the mirror specifically as "the dual-write-without-a-chokepoint shape".
 *
 * `origin` is the user_edited contract and the server enforces it, not this function: a `'source'`
 * batch cannot move a row the reader has arranged, decided from the STORED flag rather than
 * whatever this client's cache believes. The skipped count comes back so a refresh can say what it
 * left alone instead of appearing to do nothing.
 */
async function writeSeriesOrder(input: {
  seriesId: string
  slots?: SeriesSlot[]
  origin?: 'reader' | 'source'
  length?: number | null
  setLength?: boolean
}): Promise<SeriesOrderResult> {
  const { data, error } = await supabase.rpc('set_series_order', {
    p_series: input.seriesId,
    p_slots: (input.slots ?? []).map((s) => ({
      entry_id: s.entryId,
      position: s.position,
      // Only sent when the caller means to change it — the RPC keys off key PRESENCE, so passing
      // `label: undefined` and omitting the key are not the same thing to it.
      ...(s.label !== undefined ? { label: s.label } : {}),
    })),
    p_origin: input.origin ?? 'reader',
    p_opts: input.setLength ? { length: input.length ?? null } : {},
  })
  if (error) throw error
  return data as SeriesOrderResult
}

/**
 * Reposition entries (drag, ▲▼, or a typed number). Manual order always wins: a reader-origin
 * write marks every slot it touches user-edited.
 *
 * ONE CALL, whatever the gesture. The renormalize case — the whole list renumbered to clean
 * integers when decimals get too tight — used to be a LOOP of single-row updates, each its own
 * transaction, and entries passing through each other's positions committed intermediate colliding
 * states. Under `series_entries_position_uidx` that loop would fail partway and leave the reader
 * looking at a half-applied reorder; the RPC parks the affected rows above the max and writes the
 * finals in one transaction, so the whole arrangement lands or none of it does.
 */
export function useMoveEntry(name: string) {
  const invalidate = useSeriesInvalidate(name)
  return useMutation({
    meta: { action: 'The series' },
    mutationFn: (input: { seriesId: string; slots: SeriesSlot[] }) =>
      writeSeriesOrder({ seriesId: input.seriesId, slots: input.slots, origin: 'reader' }),
    onSuccess: () => invalidate(),
  })
}

/**
 * Tag a slot — "novella", "prequel". Label only.
 *
 * This used to take `position` and `bookId` too, and route them through `syncBookPosition`. That
 * branch had no production caller: the only `updateEntry.mutate` in the app (SeriesRoute's
 * `editLabel`) passes a label and nothing else, and the position path was reached solely from
 * `seriesSeedProvenance.test.tsx`. It was an exported code path kept alive by its own test, so it
 * is gone rather than re-pointed through the new RPC for the sake of symmetry.
 */
export function useUpdateEntry(name: string) {
  const invalidate = useSeriesInvalidate(name)
  return useMutation({
    meta: { action: 'The series' },
    mutationFn: async (input: { entryId: string; label: string | null }) => {
      const { error } = await supabase
        .from('series_entries')
        .update({ label: input.label, user_edited: true })
        .eq('id', input.entryId)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })
}

/**
 * Remove a slot — the series page's ✕ (docs/archive/task-series-defects.md §Removal, revised). The slot goes
 * and, when a book was linked, that book stops naming the series so reconciliation can't re-add it.
 * The row is soft-deleted rather than dropped so a later Hardcover refresh can't resurrect what the
 * reader dismissed.
 *
 * ONE RPC, ATOMICALLY (`remove_series_entry`, 20260731010000). This used to be two sequential,
 * independently-committed writes — tombstone the entry, then null `books.series` — and a failure
 * between them left the slot tombstoned while the book still named the series. That state did not go
 * stale, it silently UNDID the removal: the reconciliation in `useSeriesDetail` revives any tombstone
 * whose title matches a book still naming the series, so the next read of this page brought the slot
 * back. Both writes now land in one transaction or neither does.
 *
 * The RPC takes only the entry id. `book_id` is read from the entry row SERVER-SIDE rather than passed
 * in: the caller used to send it from whatever the component's cache held, and a stale cache would
 * clear the wrong book's series while leaving the linked one still naming it — the fix reproducing the
 * defect through its own call. The entry row is the only authority on what the slot links to.
 *
 * Works for ghosts too — an entry with no linked book tombstones and touches no `books` row at all.
 */
export function useRemoveEntry(name: string) {
  const qc = useQueryClient()
  const invalidate = useSeriesInvalidate(name)
  return useMutation({
    meta: { action: 'The series' },
    mutationFn: async (input: { entryId: string }) => {
      const { error } = await supabase.rpc('remove_series_entry', { p_entry: input.entryId })
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      void qc.invalidateQueries({ queryKey: booksKey })
      void qc.invalidateQueries({ queryKey: ['series-strip'] })
    },
  })
}

/**
 * Reconcile the book page's series edits into series_entries (docs/archive/task-series-defects.md §Positions,
 * §Removal). updateBook writes the book row; this keeps the SERIES side in step so the two surfaces
 * never disagree:
 *   · position: write the linked entry's position (user_edited, so a source refresh can't move it) —
 *     the book page's "#N" takes effect on the series page. If no entry exists yet, reconciliation
 *     seeds it from the (just-written) book row, so it lands either way. Clearing the number sends the
 *     slot to the END of the order rather than leaving a stale one — the same rule the seeder uses for
 *     a book with no number at all.
 *   · series change / clear: REMOVE the old slot. #65 kept it as a ghost, which readers reported as
 *     "removal doesn't stick" — the book was still sitting in the series. Removal now means the same
 *     thing here as it does on the series page.
 *
 * MUST run after updateBook has SETTLED: reconciliation revives a tombstone for any book still naming
 * the series, so removing before the book row is written would immediately undo itself.
 */
export function useSyncBookSeries() {
  const qc = useQueryClient()
  return useMutation({
    meta: { action: 'The series' },
    mutationFn: async ({
      book,
      newSeries,
      newPosition,
      newSeriesCount,
    }: {
      book: Book
      newSeries: string
      newPosition: number | null
      newSeriesCount?: number | null
    }) => {
      const oldSeries = (book.series ?? '').trim()
      const next = newSeries.trim()
      const seriesIdFor = async (nm: string): Promise<string | undefined> => {
        const { data } = await supabase.from('series').select('id').eq('name', nm).limit(1)
        return (data ?? [])[0]?.id as string | undefined
      }

      // Left the old series (name changed or cleared) — retire the slot.
      if (oldSeries && oldSeries !== next) {
        const sid = await seriesIdFor(oldSeries)
        if (sid) {
          await supabase.from('series_entries').update(removalPatch()).eq('series_id', sid).eq('book_id', book.id)
        }
      }

      // The book page's number and "of N" take effect on the series side.
      //
      // TWO PATHS, and the split is the same unreconciled-claim line drawn everywhere else. With a
      // series ROW and a live ENTRY, both facts belong to the series and go through the RPC, which
      // writes the entry, mirrors books.position and fans series.length out to every member book in
      // one transaction. With no series row or no entry yet, books.position/series_count are a claim
      // that is not yet a copy of anything — nothing exists for them to disagree with — so they are
      // written on the book row directly and reconciliation seeds the entry from them later.
      const sid = next ? await seriesIdFor(next) : undefined
      const entryId = sid
        ? (
            (
              await supabase
                .from('series_entries')
                .select('id')
                .eq('series_id', sid)
                .eq('book_id', book.id)
                .is('removed_at', null)
                .limit(1)
            ).data ?? []
          )[0]?.id as string | undefined
        : undefined

      let position = newPosition
      if (next && sid && position == null) {
        // Cleared: don't leave the old number standing. Send it to the end, where a book whose
        // place in the order isn't known belongs.
        const { data: maxRows } = await supabase
          .from('series_entries')
          .select('position')
          .eq('series_id', sid)
          .is('removed_at', null)
          .order('position', { ascending: false })
          .limit(1)
        position = Math.floor(Number((maxRows ?? [])[0]?.position ?? 0)) + 1
      }

      if (sid && (entryId || newSeriesCount !== undefined)) {
        await writeSeriesOrder({
          seriesId: sid,
          slots: entryId && position != null ? [{ entryId, position }] : [],
          origin: 'reader',
          setLength: newSeriesCount !== undefined,
          length: newSeriesCount ?? null,
        })
      }

      // The unreconciled half: whatever the RPC could not own, the book row still carries.
      const bookPatch: Record<string, unknown> = {}
      if (newPosition !== undefined && !entryId) bookPatch.position = newPosition
      if (newSeriesCount !== undefined && !sid) bookPatch.series_count = newSeriesCount
      if (Object.keys(bookPatch).length) {
        const { error: bErr } = await supabase.from('books').update(bookPatch).eq('id', book.id)
        if (bErr) throw bErr
      }
      return { oldSeries, next }
    },
    onSuccess: (_r, { book, newSeries }) => {
      void qc.invalidateQueries({ queryKey: seriesListKey })
      void qc.invalidateQueries({ queryKey: booksKey })
      void qc.invalidateQueries({ queryKey: ['series-strip'] })
      // REMOVE rather than invalidate: the series query is persisted to IndexedDB and staleTime keeps
      // a restored copy "fresh", so an invalidated query still PAINTS the old badges for a beat before
      // the refetch lands. Dropping it means the series page opens on its loading line and the first
      // thing the reader sees is the number they just typed.
      for (const nm of [book.series, newSeries]) if (nm?.trim()) qc.removeQueries({ queryKey: seriesKey(nm) })
    },
  })
}

/**
 * Revive a tombstone matching this title, if one exists — an explicit add is the reader taking their
 * removal back, and reusing the row keeps it from going on suppressing source refreshes forever.
 * Returns true when it handled the add.
 */
async function revivedTombstone(
  seriesId: string,
  title: string,
  author: string,
  position: number,
  bookId: string | null,
): Promise<boolean> {
  const { data } = await supabase
    .from('series_entries')
    // `author` is selected because the match needs it to break a same-title tie; ordered so that a
    // tie is at least resolved the same way twice. Both were missing before: this path picked the
    // first tombstone out of an unordered result and never read author at all.
    .select('id, title, author')
    .eq('series_id', seriesId)
    .not('removed_at', 'is', null)
    .order('position', { ascending: true })
    .order('id', { ascending: true })
  const candidates = (data ?? []) as { id: string; title: string; author: string }[]
  // The caller knows the author as a display string already (a Book's byline, or what the reader
  // typed for a ghost), so it arrives pre-joined rather than as first/last.
  const match = matchEntryForBook(candidates, { title, first: '', last: author })
  if (match.kind !== 'match') return false
  const { error } = await supabase
    .from('series_entries')
    .update({ removed_at: null, book_id: bookId, position, user_edited: true })
    .eq('id', match.entry.id)
  return !error
}

/** Add library books (the picker path) — appended to the end in pick order. */
export function useAddSeriesEntries(name: string) {
  const qc = useQueryClient()
  const invalidate = useSeriesInvalidate(name)
  return useMutation({
    meta: { action: 'The series' },
    mutationFn: async (input: { seriesId: string; books: Book[]; after: number }) => {
      const uid = await ownerId()
      let at = Math.floor(input.after)
      const rows: Record<string, unknown>[] = []
      for (const b of input.books) {
        const position = ++at
        const byline = [b.first, b.last].filter(Boolean).join(' ')
        if (await revivedTombstone(input.seriesId, b.title, byline, position, b.id)) continue
        rows.push({
          series_id: input.seriesId,
          owner_id: uid,
          position,
          title: b.title,
          author: [b.first, b.last].filter(Boolean).join(' '),
          book_id: b.id,
          source: 'manual',
          user_edited: true,
        })
      }
      if (rows.length) {
        const { error } = await supabase.from('series_entries').insert(rows)
        if (error) throw error
      }
      // membership implies the book carries the series name
      for (const b of input.books) {
        if (b.series !== name) {
          const { error: bErr } = await supabase.from('books').update({ series: name }).eq('id', b.id)
          if (bErr) throw bErr
        }
      }
    },
    onSuccess: () => {
      invalidate()
      void qc.invalidateQueries({ queryKey: booksKey })
    },
  })
}

/** A canonical entry the reader doesn't have yet — a manual ghost slot. */
export function useAddGhostEntry(name: string) {
  const invalidate = useSeriesInvalidate(name)
  return useMutation({
    meta: { action: 'The series' },
    mutationFn: async (input: { seriesId: string; title: string; author: string; position: number }) => {
      const uid = await ownerId()
      if (await revivedTombstone(input.seriesId, input.title, input.author, input.position, null))
        return
      const { error } = await supabase.from('series_entries').insert({
        series_id: input.seriesId,
        owner_id: uid,
        position: input.position,
        title: input.title,
        author: input.author,
        source: 'manual',
        user_edited: true,
      })
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })
}

/**
 * The ghost-slot add action: creates a real (wishlist — per ownership model, a wanting context)
 * book record, links the entry, and optionally lands it straight on a TBR.
 */
export function useAcquireGhost(name: string) {
  const qc = useQueryClient()
  const invalidate = useSeriesInvalidate(name)
  return useMutation({
    meta: { action: 'The series' },
    mutationFn: async (input: { entry: SeriesEntry; genre: string; tbrId?: string }): Promise<string> => {
      const uid = await ownerId()
      const { first, last } = splitName(input.entry.author)
      const { data: book, error } = await supabase
        .from('books')
        .insert({
          owner_id: uid,
          title: input.entry.title,
          author_first: first || null,
          author_last: last || null,
          series: name,
          position: input.entry.position,
          ownership: 'unowned',
          wishlist: true,
          borrowed: false,
          genre: input.genre,
          source: 'Series',
        })
        .select('id')
        .single()
      if (error) throw error
      const bookId = (book as { id: string }).id
      const { error: linkErr } = await supabase.from('series_entries').update({ book_id: bookId }).eq('id', input.entry.id)
      if (linkErr) throw linkErr
      if (input.tbrId) {
        const { data: maxRows } = await supabase
          .from('list_items')
          .select('position')
          .eq('list_id', input.tbrId)
          .order('position', { ascending: false })
          .limit(1)
        const after = ((maxRows?.[0]?.position as number | null) ?? 0) + 1000
        const { error: liErr } = await supabase
          .from('list_items')
          .insert({ list_id: input.tbrId, book_id: bookId, owner_id: uid, position: after })
        if (liErr) throw liErr
      }
      return bookId
    },
    onSuccess: () => {
      invalidate()
      void qc.invalidateQueries({ queryKey: booksKey })
      void qc.invalidateQueries({ queryKey: allListItemsKey })
    },
  })
}

/**
 * Hardcover seeding — source data only fills gaps. New canonical slots arrive as ghosts; an
 * un-edited entry may take a refreshed position; user_edited rows are never moved, and nothing is
 * ever deleted.
 *
 * "Linked library books are never moved" was true when this was written and is no longer: a linked
 * entry the reader has not arranged is precisely what this now corrects. What protects a row is the
 * reader having touched it, not the row having a book attached.
 */
export function useApplySeriesSource(name: string) {
  const invalidate = useSeriesInvalidate(name)
  return useMutation({
    meta: { action: 'The series' },
    mutationFn: async (input: { detail: SeriesDetail; author: string }): Promise<{ added: number; skipped: number; unavailable: boolean }> => {
      const uid = await ownerId()
      const { data, error } = await supabase.functions.invoke('series', {
        body: { name, author: input.author },
      })
      if (error) throw error
      const payload = data as { sourceRef: string | null; entries: { position: number; title: string; author: string }[]; unavailable?: boolean }
      const src = payload.entries ?? []
      const { detail } = input
      // Tombstones join `existing` so a removed slot MATCHES and is therefore never re-inserted —
      // the whole point of keeping them. They carry user_edited, so the merge can't try to move one.
      const { inserts, moves } = mergeSourceEntries([...detail.entries, ...detail.removed], src)
      // ONE batched call, `origin: 'source'`. Two things change here beyond atomicity. The moves
      // used to go one row at a time, so a catalog reshuffle that passed entries through each
      // other's positions committed colliding intermediates. And `mergeSourceEntries` decided the
      // user_edited question client-side, from this component's cache; the RPC re-decides it from
      // the STORED flag and drops any row the reader has arranged, so a stale cache can no longer
      // talk the source into overwriting a reader's placement.
      let skipped = 0
      if (moves.length) {
        const res = await writeSeriesOrder({
          seriesId: detail.series.id,
          slots: moves.map((m) => ({ entryId: m.id, position: m.position })),
          origin: 'source',
        })
        skipped = res.skipped_user_edited
      }
      // A source entry with no usable number goes to the END, not to 0. `position: ... : 0` parked
      // every unnumbered arrival on the same slot, so the first one took 0 and each one after it
      // collided with it — silently before Phase 2, and as a rejected insert once
      // series_entries_position_uidx lands. The end of the order is where a book whose place isn't
      // known belongs; it is the same rule the seeder and the cleared-number path already use.
      let nextFree = Math.floor(Math.max(0, ...detail.entries.map((e) => e.position)))
      let added = 0
      for (const s of inserts) {
        const { error: iErr } = await supabase.from('series_entries').insert({
          series_id: detail.series.id,
          owner_id: uid,
          position: s.position > 0 ? s.position : ++nextFree,
          title: s.title,
          author: s.author,
          source: 'hardcover',
          user_edited: false,
        })
        if (!iErr) added++
      }
      await supabase
        .from('series')
        .update({
          refreshed_at: new Date().toISOString(),
          ...(src.length ? { source: 'hardcover', source_ref: payload.sourceRef } : {}),
        })
        .eq('id', detail.series.id)
      return { added, skipped, unavailable: !!payload.unavailable && !src.length }
    },
    onSuccess: () => invalidate(),
  })
}
