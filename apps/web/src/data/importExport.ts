import { isContributorRole, parseCsvIncoming, type Book, type Contributor } from '@reverie/core'
import { supabase } from '../lib/supabase'
import type { BookRow } from './types'
import { applyIncoming, type ReviewCandidate } from './intake'
import { loadVerdicts } from './duplicates'
import { persistContributors } from './contributors'

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error('Not signed in')
  return id
}

type EmbeddedAuthor = { name: string } | { name: string }[] | null
interface ContribJoinRow {
  id: string
  book_authors: { position: number; role: string; authors: EmbeddedAuthor }[]
}
const authorName = (a: EmbeddedAuthor): string => (Array.isArray(a) ? (a[0]?.name ?? '') : (a?.name ?? ''))

/**
 * Serialize the WHOLE account to a JSON backup (v4): books (incl. genre/tags/intensity/owned
 * formats), per-book contributors, reads, lists + memberships, the user's reviews, reading orders +
 * items, merge verdicts, and the profile (skin/mode + adaptive taste state + goal). Symmetric with
 * deletion — everything the account holds round-trips.
 */
export async function buildBackup(): Promise<string> {
  const ownerId = await currentUserId()
  const [books, contribs, reads, lists, items, reviews, orders, verdicts, profile] = await Promise.all([
    supabase.from('books').select('*'),
    supabase.from('books').select('id, book_authors(position, role, authors(name))'),
    supabase.from('reads').select('*'),
    supabase.from('lists').select('*'),
    supabase.from('list_items').select('*'),
    supabase.from('reviews').select('work_key, reviewer_name, rating, body, created_at').eq('reviewer_id', ownerId),
    supabase.from('reading_orders').select('id, name, description, reading_order_items(position, book_id, series, note)'),
    supabase.from('merge_verdicts').select('book_id, incoming_key, verdict'),
    supabase
      .from('profiles')
      .select('display_name, goal_year, goal_target, auto_merge_duplicates, default_store_id, default_store_name, default_store_website, skin, mode, adaptive_skin, adaptive_locked')
      .eq('id', ownerId)
      .maybeSingle(),
  ])
  for (const r of [books, contribs, reads, lists, items, reviews, orders, verdicts]) if (r.error) throw r.error

  // Per-book contributors, keyed by (old) book id.
  const contributorsByBook: Record<string, { name: string; role: string; position: number }[]> = {}
  for (const row of (contribs.data as unknown as ContribJoinRow[]) ?? []) {
    const list = (row.book_authors ?? [])
      .map((ba) => ({ name: authorName(ba.authors), role: ba.role, position: ba.position }))
      .filter((c) => c.name)
      .sort((a, b) => a.position - b.position)
    if (list.length) contributorsByBook[row.id] = list
  }

  return JSON.stringify({
    v: 4,
    app: 'reverie',
    exportedAt: new Date().toISOString(),
    books: books.data,
    contributors: contributorsByBook,
    reads: reads.data,
    lists: lists.data,
    list_items: items.data,
    reviews: reviews.data,
    reading_orders: orders.data,
    merge_verdicts: verdicts.data,
    profile: profile.data ?? null,
  })
}

interface BackupShape {
  books?: BookRow[]
  contributors?: Record<string, { name: string; role: string; position: number }[]>
  reads?: { book_id: string; read_on: string | null; format: string | null; rating: number | null; notes: string | null }[]
  lists?: { id: string; name: string; kind: string; is_priority: boolean }[]
  list_items?: { list_id: string; book_id: string; position: number | null }[]
  reviews?: { work_key: string; reviewer_name: string | null; rating: number | null; body: string }[]
  reading_orders?: { name: string; description: string | null; reading_order_items: { position: number; book_id: string | null; series: string | null; note: string | null }[] }[]
  merge_verdicts?: { book_id: string; incoming_key: string; verdict: string }[]
  profile?: Record<string, unknown> | null
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
    const newId = (created as { id: string }).id
    bookIdMap.set(b.id, newId)
    // Restore the book's full contributor list (v4) via the owner-scoped RPC.
    const contribs = data.contributors?.[b.id]
    if (contribs?.length) {
      const list: Contributor[] = contribs.map((c, i) => ({
        name: c.name,
        role: isContributorRole(c.role) ? c.role : 'author',
        position: c.position ?? i,
      }))
      await persistContributors(newId, list)
    }
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

  // Reading orders (v4): recreate each order + its items, remapping book ids (series stay by name).
  for (const o of data.reading_orders ?? []) {
    const { data: created, error } = await supabase
      .from('reading_orders')
      .insert({ owner_id: ownerId, name: o.name, description: o.description })
      .select('id')
      .single()
    if (error) throw error
    const orderId = (created as { id: string }).id
    const orderItems = (o.reading_order_items ?? [])
      .map((it) => {
        const bookId = it.book_id ? bookIdMap.get(it.book_id) : null
        if (it.book_id && !bookId) return null // a book that didn't come across
        return { reading_order_id: orderId, owner_id: ownerId, position: it.position, book_id: bookId ?? null, series: it.series, note: it.note }
      })
      .filter((it): it is NonNullable<typeof it> => it !== null)
    if (orderItems.length) {
      const { error: ie } = await supabase.from('reading_order_items').insert(orderItems)
      if (ie) throw ie
    }
  }

  // Merge verdicts (v4), remapped onto the new book ids.
  const verdicts = (data.merge_verdicts ?? [])
    .map((v) => {
      const bookId = bookIdMap.get(v.book_id)
      return bookId ? { owner_id: ownerId, book_id: bookId, incoming_key: v.incoming_key, verdict: v.verdict } : null
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
  if (verdicts.length) {
    const { error } = await supabase.from('merge_verdicts').upsert(verdicts, { onConflict: 'owner_id,book_id,incoming_key' })
    if (error) throw error
  }

  // Profile: restore appearance + adaptive taste state + goal onto the current account.
  if (data.profile) {
    const { error } = await supabase.from('profiles').update(data.profile).eq('id', ownerId)
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
