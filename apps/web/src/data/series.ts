import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ghostMatchesBook,
  mergeSourceEntries,
  sortEntries,
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
 * data only ever FILLS GAPS — a user_edited entry is never touched, nothing is ever deleted.
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
}

export interface SeriesDetail {
  series: UiSeries
  entries: SeriesEntry[]
}

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

/** All series rows + canonical entry counts — the library Series strips' overlay. */
export function useSeriesList() {
  return useQuery({
    queryKey: seriesListKey,
    queryFn: async (): Promise<Map<string, { series: UiSeries; total: number; ghosts: number }>> => {
      const [{ data: rows, error }, { data: ents, error: e2 }] = await Promise.all([
        supabase.from('series').select('*'),
        supabase.from('series_entries').select('id, series_id, book_id'),
      ])
      if (error) throw error
      if (e2) throw e2
      const byId = new Map<string, { series: UiSeries; total: number; ghosts: number }>()
      for (const r of (rows ?? []) as SeriesRowT[]) byId.set(r.id, { series: toUiSeries(r), total: 0, ghosts: 0 })
      for (const e of (ents ?? []) as { series_id: string; book_id: string | null }[]) {
        const s = byId.get(e.series_id)
        if (!s) continue
        s.total++
        if (!e.book_id) s.ghosts++
      }
      const byName = new Map<string, { series: UiSeries; total: number; ghosts: number }>()
      for (const v of byId.values()) byName.set(v.series.name.toLowerCase(), v)
      return byName
    },
  })
}

/**
 * The series page's query: find-or-create the row by name, reconcile the library into the
 * entries (idempotent — safe to re-run), return the detail. Library books naming this series
 * always have an entry; their arranged positions are USER data (user_edited), so source
 * refreshes can never move them.
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
        const { data: created, error: cErr } = await supabase
          .from('series')
          .insert({ owner_id: uid, name })
          .select()
          .single()
        if (cErr) throw cErr
        row = created as SeriesRowT
      }
      const seriesRow: SeriesRowT = row

      const [{ data: entRows, error: eErr }, { data: libRows, error: bErr }] = await Promise.all([
        supabase.from('series_entries').select('*').eq('series_id', seriesRow.id),
        supabase
          .from('books')
          .select('id, title, author_first, author_last, position, status')
          .eq('series', name),
      ])
      if (eErr) throw eErr
      if (bErr) throw bErr
      let entries = ((entRows ?? []) as SeriesEntryRowT[]).map(toEntry)
      const lib = (libRows ?? []) as { id: string; title: string; author_first: string | null; author_last: string | null; position: number | null; status: string | null }[]

      // 1) ghosts adopt matching library books (an import landed after the ghost was seeded)
      const linked = new Set(entries.filter((e) => e.bookId).map((e) => e.bookId as string))
      for (const b of lib) {
        if (linked.has(b.id)) continue
        const ghost = entries.find((e) => ghostMatchesBook(e, b))
        if (ghost) {
          await supabase.from('series_entries').update({ book_id: b.id }).eq('id', ghost.id)
          ghost.bookId = b.id
          linked.add(b.id)
        }
      }
      // 2) every library book naming this series gets an entry
      let appendAt = Math.floor(Math.max(0, ...entries.map((e) => e.position)))
      const inserts = lib
        .filter((b) => !linked.has(b.id))
        .map((b) => ({
          series_id: seriesRow.id,
          owner_id: uid,
          position: b.position ?? ++appendAt,
          title: b.title,
          author: [b.author_first, b.author_last].filter(Boolean).join(' '),
          book_id: b.id,
          source: 'manual',
          user_edited: true,
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
      return { series: toUiSeries(seriesRow), entries: sortEntries(entries) }
    },
  })
}

/** Read-only peek for the book-detail strip and the chain prompt — never creates rows. */
export async function fetchSeriesEntries(name: string): Promise<SeriesEntry[] | null> {
  const { data: rows } = await supabase.from('series').select('id').eq('name', name).limit(1)
  const row = (rows ?? [])[0] as { id: string } | undefined
  if (!row) return null
  const { data: ents } = await supabase.from('series_entries').select('*').eq('series_id', row.id)
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

/** Reposition one entry (drag or ▲▼). Manual order always wins: marks the entry user-edited.
 *  When decimals got too tight the caller sends `updates` — the whole list renumbered to clean
 *  integers in its new visual order (the silent renormalize). */
/** Mirror a linked entry's position onto its book row, so the book page's "#N in series" agrees with
 *  the series page's reading order. Ghost entries (no book_id) have nothing to sync. */
async function syncBookPosition(bookId: string | null | undefined, position: number): Promise<void> {
  if (!bookId) return
  await supabase.from('books').update({ position }).eq('id', bookId)
}

export function useMoveEntry(name: string) {
  const invalidate = useSeriesInvalidate(name)
  return useMutation({
    mutationFn: async (input: {
      entryId: string
      position: number
      bookId?: string | null
      updates?: { id: string; position: number; userEdited: boolean; bookId?: string | null }[]
    }) => {
      if (input.updates) {
        for (const u of input.updates) {
          const { error } = await supabase
            .from('series_entries')
            .update({ position: u.position, user_edited: u.userEdited })
            .eq('id', u.id)
          if (error) throw error
          await syncBookPosition(u.bookId, u.position) // series drag → book page reflects it
        }
        return
      }
      const { error } = await supabase
        .from('series_entries')
        .update({ position: input.position, user_edited: true })
        .eq('id', input.entryId)
      if (error) throw error
      await syncBookPosition(input.bookId, input.position)
    },
    onSuccess: () => invalidate(),
  })
}

export function useUpdateEntry(name: string) {
  const invalidate = useSeriesInvalidate(name)
  return useMutation({
    mutationFn: async (input: { entryId: string; label?: string | null; position?: number; bookId?: string | null }) => {
      const patch: Record<string, unknown> = { user_edited: true }
      if (input.label !== undefined) patch.label = input.label
      if (input.position !== undefined) patch.position = input.position
      const { error } = await supabase.from('series_entries').update(patch).eq('id', input.entryId)
      if (error) throw error
      if (input.position !== undefined) await syncBookPosition(input.bookId, input.position)
    },
    onSuccess: () => invalidate(),
  })
}

/**
 * Remove a slot from the series page ENTIRELY (task-series-defects §Removal). Deletes the entry AND, if
 * it was linked to a book, clears that book's `series` so the reconciliation in useSeriesDetail can't
 * re-add it on the next load (which is exactly why removal looked irreversible). Contrast the book page,
 * which DETACHES the book but keeps the canonical slot as a ghost (see useDetachBookFromSeries).
 */
export function useRemoveEntry(name: string) {
  const invalidate = useSeriesInvalidate(name)
  return useMutation({
    mutationFn: async (input: { entryId: string; bookId?: string | null }) => {
      const { error } = await supabase.from('series_entries').delete().eq('id', input.entryId)
      if (error) throw error
      if (input.bookId) {
        const { error: bErr } = await supabase.from('books').update({ series: '' }).eq('id', input.bookId)
        if (bErr) throw bErr
      }
    },
    onSuccess: () => invalidate(),
  })
}

/**
 * Reconcile the book page's series edits into series_entries (task-series-defects §Positions/§Removal).
 * updateBook writes the book row; this keeps the SERIES side in step so the two surfaces never disagree:
 *   · position: write the linked entry's position (user_edited, so a source refresh can't move it) — the
 *     book page's "#N" now takes effect on the series page. If no entry exists yet, the series page's
 *     reconciliation seeds it from the (just-written) book row, so it lands either way.
 *   · series change / clear: DETACH from the old series — convert its entry to a GHOST (book_id → null,
 *     keep the slot's title/author/position) so the canonical reading-order slot survives but the book
 *     leaves. Without this, clearing the field left the link and the reconciliation re-added the book.
 * Call AFTER updateBook (the book row must already reflect the new series/position).
 */
export function useSyncBookSeries() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ book, newSeries, newPosition }: { book: Book; newSeries: string; newPosition: number | null }) => {
      const oldSeries = (book.series ?? '').trim()
      const next = newSeries.trim()

      // Detach from the old series (name changed or cleared): keep the slot as a ghost.
      if (oldSeries && oldSeries !== next) {
        const { data: sRows } = await supabase.from('series').select('id').eq('name', oldSeries).limit(1)
        const sid = (sRows ?? [])[0]?.id as string | undefined
        if (sid) {
          await supabase
            .from('series_entries')
            .update({
              book_id: null,
              title: book.title,
              author: [book.first, book.last].filter(Boolean).join(' '),
            })
            .eq('series_id', sid)
            .eq('book_id', book.id)
        }
      }

      // Write the position into the (possibly new) series so the book page's value takes effect.
      if (next && newPosition != null) {
        const { data: sRows } = await supabase.from('series').select('id').eq('name', next).limit(1)
        const sid = (sRows ?? [])[0]?.id as string | undefined
        if (sid) {
          await supabase
            .from('series_entries')
            .update({ position: newPosition, user_edited: true })
            .eq('series_id', sid)
            .eq('book_id', book.id)
        }
      }
      return { oldSeries, next }
    },
    onSuccess: (_r, { book, newSeries }) => {
      void qc.invalidateQueries({ queryKey: seriesListKey })
      void qc.invalidateQueries({ queryKey: booksKey })
      for (const nm of [book.series, newSeries]) if (nm?.trim()) void qc.invalidateQueries({ queryKey: seriesKey(nm) })
    },
  })
}

/** Add library books (the picker path) — appended to the end in pick order. */
export function useAddSeriesEntries(name: string) {
  const qc = useQueryClient()
  const invalidate = useSeriesInvalidate(name)
  return useMutation({
    mutationFn: async (input: { seriesId: string; books: Book[]; after: number }) => {
      const uid = await ownerId()
      let at = Math.floor(input.after)
      const rows = input.books.map((b) => ({
        series_id: input.seriesId,
        owner_id: uid,
        position: ++at,
        title: b.title,
        author: [b.first, b.last].filter(Boolean).join(' '),
        book_id: b.id,
        source: 'manual',
        user_edited: true,
      }))
      const { error } = await supabase.from('series_entries').insert(rows)
      if (error) throw error
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
    mutationFn: async (input: { seriesId: string; title: string; author: string; position: number }) => {
      const uid = await ownerId()
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
 * The ghost-slot add action: creates a real (unowned — per ownership model, a wanting context)
 * book record, links the entry, and optionally lands it straight on a TBR.
 */
export function useAcquireGhost(name: string) {
  const qc = useQueryClient()
  const invalidate = useSeriesInvalidate(name)
  return useMutation({
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
 * Hardcover seeding — source data only fills gaps. New canonical slots arrive as ghosts;
 * an un-edited hardcover entry may take a refreshed position; user_edited rows and linked
 * library books are never moved, and nothing is ever deleted.
 */
export function useApplySeriesSource(name: string) {
  const invalidate = useSeriesInvalidate(name)
  return useMutation({
    mutationFn: async (input: { detail: SeriesDetail; author: string }): Promise<{ added: number; unavailable: boolean }> => {
      const uid = await ownerId()
      const { data, error } = await supabase.functions.invoke('series', {
        body: { name, author: input.author },
      })
      if (error) throw error
      const payload = data as { sourceRef: string | null; entries: { position: number; title: string; author: string }[]; unavailable?: boolean }
      const src = payload.entries ?? []
      const { detail } = input
      const { inserts, moves } = mergeSourceEntries(detail.entries, src)
      for (const m of moves) {
        await supabase.from('series_entries').update({ position: m.position }).eq('id', m.id)
      }
      let added = 0
      for (const s of inserts) {
        const { error: iErr } = await supabase.from('series_entries').insert({
          series_id: detail.series.id,
          owner_id: uid,
          position: s.position > 0 ? s.position : 0,
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
      return { added, unavailable: !!payload.unavailable && !src.length }
    },
    onSuccess: () => invalidate(),
  })
}
