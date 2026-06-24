import { useQueryClient } from '@tanstack/react-query'
import { deriveBoyfriend, matchBook, mergeImport, type Book, type Incoming } from '@reverie/core'
import { supabase } from '../lib/supabase'
import { toBookRow } from './mappers'
import { booksKey } from './books'

export interface ReviewCandidate {
  incoming: Incoming
  existingId: string
  existingTitle: string
  existingAuthor: string
}

export type IntakeOutcome = 'added' | 'merged' | 'unchanged' | 'review'
export interface IntakeResult {
  outcome: IntakeOutcome
  review?: ReviewCandidate
  bookId?: string
}

/** Build a full Book from an incoming partial (defaults for anything the source didn't give). */
export function incomingToBook(inc: Incoming): Book {
  const tropes = inc.tropes ?? []
  const subgenre = inc.subgenre ?? 'Romance'
  return {
    id: '',
    title: inc.title,
    first: inc.first ?? '',
    last: inc.last ?? '',
    series: inc.series ?? '',
    position: inc.position ?? '',
    seriesCount: inc.seriesCount ?? null,
    status: inc.status ?? 'Standalone',
    subgenre,
    genres: inc.genres ?? [],
    tropes,
    spice: inc.spice ?? 0,
    cover: inc.cover ?? '',
    isbn: inc.isbn ?? '',
    fave: inc.fave ?? false,
    owned: inc.owned ?? { physical: false, ebook: false, audiobook: false },
    format: inc.format ?? 'Paperback',
    rating: inc.rating ?? 0,
    readStatus: inc.readStatus ?? 'Unread',
    source: inc.source ?? 'Owned',
    pub: inc.pub ?? { y: null, m: null, d: null },
    reads: [],
    plan: inc.plan ?? null,
    progress: inc.progress ?? 0,
    boyfriend: deriveBoyfriend({ tropes, subgenre }),
    addedTs: Date.now(),
  }
}

async function insertReads(bookId: string, ownerId: string, reads: Book['reads']): Promise<void> {
  if (!reads.length) return
  const { error } = await supabase.from('reads').insert(
    reads.map((r) => ({
      book_id: bookId,
      owner_id: ownerId,
      read_on: r.date || null,
      format: r.format || null,
      rating: r.rating || null,
      notes: r.notes || null,
    })),
  )
  if (error) throw error
}

/**
 * Intake one incoming record against the (mutable) library snapshot:
 * - no/`add`-mode fuzzy → insert a new book (the existing-row policy never applies to a new book);
 * - strong match (ISBN / title+author / title+series+pos) → merge fields INTO the existing row
 *   (existing id/memberships/reads survive; user-authored fields win); idempotent;
 * - fuzzy in `review` mode → returned as a review candidate, nothing written.
 * Mutates `library` so repeated rows in one import dedupe against earlier ones.
 */
export async function applyIncoming(
  inc: Incoming,
  library: Book[],
  ownerId: string,
  fuzzyMode: 'review' | 'add',
): Promise<IntakeResult> {
  const m = matchBook(inc, library)

  if (m.strength === 'none' || (m.strength === 'fuzzy' && fuzzyMode === 'add')) {
    const book = incomingToBook(inc)
    const { data, error } = await supabase
      .from('books')
      .insert({ ...toBookRow(book), owner_id: ownerId, title: book.title })
      .select('id')
      .single()
    if (error) throw error
    const id = (data as { id: string }).id
    await insertReads(id, ownerId, inc.reads ?? [])
    library.push({ ...book, id, reads: inc.reads ?? [] })
    return { outcome: 'added', bookId: id }
  }

  if (m.strength === 'fuzzy') {
    return {
      outcome: 'review',
      review: {
        incoming: inc,
        existingId: m.book.id,
        existingTitle: m.book.title,
        existingAuthor: [m.book.first, m.book.last].filter(Boolean).join(' '),
      },
    }
  }

  // Strong match → fold into the existing record.
  const { patch, newReads, changed } = mergeImport(m.book, inc)
  if (!changed) return { outcome: 'unchanged', bookId: m.book.id }
  if (Object.keys(patch).length) {
    const { error } = await supabase.from('books').update(toBookRow(patch)).eq('id', m.book.id)
    if (error) throw error
  }
  await insertReads(m.book.id, ownerId, newReads)
  Object.assign(m.book, patch)
  m.book.reads = [...m.book.reads, ...newReads]
  return { outcome: 'merged', bookId: m.book.id }
}

/** Single-intake hook for the Add / bulk paths — matches against the books cache, then writes. */
export function useIntake() {
  const qc = useQueryClient()
  return async (inc: Incoming, fuzzyMode: 'review' | 'add' = 'add'): Promise<IntakeResult> => {
    const { data: auth } = await supabase.auth.getUser()
    const ownerId = auth.user?.id
    if (!ownerId) throw new Error('Not signed in')
    const library = (qc.getQueryData<Book[]>(booksKey) ?? []).map((b) => ({ ...b, reads: [...b.reads] }))
    const result = await applyIncoming(inc, library, ownerId, fuzzyMode)
    await qc.invalidateQueries({ queryKey: booksKey })
    await qc.invalidateQueries({ queryKey: ['reads', 'all'] })
    return result
  }
}
