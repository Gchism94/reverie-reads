import { parseCsvIncoming, type Book } from '@reverie/core'
import { supabase } from '../lib/supabase'
import type { BookRow } from './types'
import { applyIncoming, type ReviewCandidate } from './intake'
import { loadVerdicts } from './duplicates'

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error('Not signed in')
  return id
}

/** Serialize the whole library (books incl. ownership, reads, lists, memberships, and the
 * user's own reviews) to a JSON backup. */
export async function buildBackup(): Promise<string> {
  const ownerId = await currentUserId()
  const [books, reads, lists, items, reviews] = await Promise.all([
    supabase.from('books').select('*'),
    supabase.from('reads').select('*'),
    supabase.from('lists').select('*'),
    supabase.from('list_items').select('*'),
    supabase.from('reviews').select('work_key, reviewer_name, rating, body, created_at').eq('reviewer_id', ownerId),
  ])
  for (const r of [books, reads, lists, items, reviews]) if (r.error) throw r.error
  return JSON.stringify({
    v: 3,
    app: 'reverie',
    exportedAt: new Date().toISOString(),
    books: books.data,
    reads: reads.data,
    lists: lists.data,
    list_items: items.data,
    reviews: reviews.data,
  })
}

interface BackupShape {
  books?: BookRow[]
  reads?: { book_id: string; read_on: string | null; format: string | null; rating: number | null; notes: string | null }[]
  lists?: { id: string; name: string; kind: string; is_priority: boolean }[]
  list_items?: { list_id: string; book_id: string; position: number | null }[]
  reviews?: { work_key: string; reviewer_name: string | null; rating: number | null; body: string }[]
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

  // The user's own reviews, re-owned to the current account (work_key is stable).
  const reviews = (data.reviews ?? []).map((rv) => ({
    work_key: rv.work_key,
    reviewer_id: ownerId,
    reviewer_name: rv.reviewer_name,
    rating: rv.rating,
    body: rv.body ?? '',
  }))
  if (reviews.length) {
    const { error } = await supabase
      .from('reviews')
      .upsert(reviews, { onConflict: 'work_key,reviewer_id' })
    if (error) throw error
  }

  return { books: bookIdMap.size, lists: listIdMap.size, reads: reads.length }
}

/**
 * Import a Goodreads/StoryGraph CSV. Each row is matched against the library (ISBN 10↔13 →
 * title+author → title+series+position → fuzzy). Strong matches fold into the EXISTING record
 * (its id, list/club memberships, reads, and calendar attribution survive; user-authored fields
 * win); fuzzy near-matches are returned for review (never auto-merged); the rest are inserted.
 * Real reads are loaded up front so re-importing the same file is a no-op.
 */
export async function importCsvToBackend(
  currentBooks: Book[],
  text: string,
  opts: { autoMerge: boolean },
): Promise<{ added: number; merged: number; review: ReviewCandidate[] }> {
  const ownerId = await currentUserId()
  const incomings = parseCsvIncoming(text)
  const verdicts = await loadVerdicts()

  const { data: readRows, error: re } = await supabase
    .from('reads')
    .select('book_id, read_on, format, rating, notes')
  if (re) throw re
  const readsByBook = new Map<string, Book['reads']>()
  for (const r of (readRows as {
    book_id: string
    read_on: string | null
    format: string | null
    rating: number | null
    notes: string | null
  }[]) ?? []) {
    const arr = readsByBook.get(r.book_id) ?? []
    arr.push({ date: r.read_on ?? '', format: r.format ?? '', rating: r.rating ?? 0, notes: r.notes ?? '' })
    readsByBook.set(r.book_id, arr)
  }
  const library = currentBooks.map((b) => ({ ...b, reads: readsByBook.get(b.id) ?? [] }))

  let added = 0
  let merged = 0
  const review: ReviewCandidate[] = []
  for (const inc of incomings) {
    const res = await applyIncoming(inc, library, ownerId, {
      fuzzy: 'review',
      autoMergeStrong: opts.autoMerge,
      verdicts,
    })
    if (res.outcome === 'added') added++
    else if (res.outcome === 'merged') merged++
    else if (res.outcome === 'review' && res.review) review.push(res.review)
  }
  return { added, merged, review }
}
