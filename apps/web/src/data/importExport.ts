import { importCsv as importCsvCore, type Book } from '@reverie/core'
import { supabase } from '../lib/supabase'
import { toBookRow } from './mappers'
import type { BookRow } from './types'

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error('Not signed in')
  return id
}

/** Serialize the whole library (books + reads + lists + memberships) to a JSON backup. */
export async function buildBackup(): Promise<string> {
  const [books, reads, lists, items] = await Promise.all([
    supabase.from('books').select('*'),
    supabase.from('reads').select('*'),
    supabase.from('lists').select('*'),
    supabase.from('list_items').select('*'),
  ])
  for (const r of [books, reads, lists, items]) if (r.error) throw r.error
  return JSON.stringify({
    v: 2,
    app: 'reverie',
    exportedAt: new Date().toISOString(),
    books: books.data,
    reads: reads.data,
    lists: lists.data,
    list_items: items.data,
  })
}

interface BackupShape {
  books?: BookRow[]
  reads?: { book_id: string; read_on: string | null; format: string | null; rating: number | null; notes: string | null }[]
  lists?: { id: string; name: string; kind: string; is_priority: boolean }[]
  list_items?: { list_id: string; book_id: string; position: number | null }[]
}

/** Restore a backup as new rows owned by the current user (ids are remapped, not reused). */
export async function restoreBackup(
  json: string,
): Promise<{ books: number; lists: number; reads: number }> {
  const ownerId = await currentUserId()
  const data = JSON.parse(json) as BackupShape
  if (!data.books) throw new Error('That file doesn’t look like a Reverie backup.')

  // Lists first, mapping old → new ids.
  const listIdMap = new Map<string, string>()
  for (const l of data.lists ?? []) {
    const { data: created, error } = await supabase
      .from('lists')
      .insert({ owner_id: ownerId, name: l.name, kind: l.kind, is_priority: l.is_priority })
      .select('id')
      .single()
    if (error) throw error
    listIdMap.set(l.id, (created as { id: string }).id)
  }

  // Books next.
  const bookIdMap = new Map<string, string>()
  for (const b of data.books) {
    const { id: _id, owner_id: _owner, added_at: _a, updated_at: _u, ...rest } = b
    const { data: created, error } = await supabase
      .from('books')
      .insert({ ...rest, owner_id: ownerId })
      .select('id')
      .single()
    if (error) throw error
    bookIdMap.set(b.id, (created as { id: string }).id)
  }

  // Reads + memberships, remapped onto the new ids.
  const reads = (data.reads ?? [])
    .map((r) => {
      const bookId = bookIdMap.get(r.book_id)
      return bookId
        ? { book_id: bookId, owner_id: ownerId, read_on: r.read_on, format: r.format, rating: r.rating, notes: r.notes }
        : null
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
  if (reads.length) {
    const { error } = await supabase.from('reads').insert(reads)
    if (error) throw error
  }

  const items = (data.list_items ?? [])
    .map((it) => {
      const listId = listIdMap.get(it.list_id)
      const bookId = bookIdMap.get(it.book_id)
      return listId && bookId
        ? { list_id: listId, book_id: bookId, owner_id: ownerId, position: it.position }
        : null
    })
    .filter((it): it is NonNullable<typeof it> => it !== null)
  if (items.length) {
    const { error } = await supabase.from('list_items').insert(items)
    if (error) throw error
  }

  return { books: bookIdMap.size, lists: listIdMap.size, reads: reads.length }
}

/**
 * Import a Goodreads/StoryGraph CSV. Runs @reverie/core's importCsv to merge by title+author,
 * then persists: new books (with their read dates) are inserted; matched existing books get
 * their rating/status/pub updated and any new read dates appended (existing dates are skipped).
 */
export async function importCsvToBackend(
  currentBooks: Book[],
  text: string,
): Promise<{ added: number; updated: number }> {
  const ownerId = await currentUserId()
  const originalById = new Map(currentBooks.map((b) => [b.id, b]))
  const { books: result } = importCsvCore(currentBooks, text)

  let added = 0
  let updated = 0

  for (const b of result) {
    const original = originalById.get(b.id)
    if (!original) {
      // New book: insert the row, then its reads.
      const { data: created, error } = await supabase
        .from('books')
        .insert({ ...toBookRow(b), owner_id: ownerId, title: b.title })
        .select('id')
        .single()
      if (error) throw error
      const newId = (created as { id: string }).id
      if (b.reads.length) {
        const { error: re } = await supabase.from('reads').insert(
          b.reads.map((r) => ({
            book_id: newId,
            owner_id: ownerId,
            read_on: r.date || null,
            format: r.format || null,
            rating: r.rating || null,
            notes: r.notes || null,
          })),
        )
        if (re) throw re
      }
      added++
      continue
    }

    // Existing book: did the CSV change rating / status / pub?
    const fieldChanged =
      b.rating !== original.rating ||
      b.readStatus !== original.readStatus ||
      JSON.stringify(b.pub) !== JSON.stringify(original.pub)
    if (fieldChanged) {
      const { error } = await supabase
        .from('books')
        .update(toBookRow({ rating: b.rating, readStatus: b.readStatus, pub: b.pub }))
        .eq('id', b.id)
      if (error) throw error
    }

    // Append read dates the book doesn't already have.
    if (b.reads.length) {
      const { data: existing } = await supabase.from('reads').select('read_on').eq('book_id', b.id)
      const have = new Set((existing as { read_on: string | null }[] | null)?.map((r) => r.read_on) ?? [])
      const fresh = b.reads.filter((r) => r.date && !have.has(r.date))
      if (fresh.length) {
        const { error } = await supabase.from('reads').insert(
          fresh.map((r) => ({
            book_id: b.id,
            owner_id: ownerId,
            read_on: r.date,
            format: r.format || null,
            rating: r.rating || null,
            notes: r.notes || null,
          })),
        )
        if (error) throw error
      }
    }

    if (fieldChanged || b.reads.length) updated++
  }

  return { added, updated }
}
