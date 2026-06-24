import { useQueryClient } from '@tanstack/react-query'
import {
  decideIntake,
  deriveBoyfriend,
  importKey,
  matchBook,
  mergeImport,
  type Book,
  type DuplicateVerdict,
  type ImportMergeResult,
  type Incoming,
  type MatchStrength,
} from '@reverie/core'
import { supabase } from '../lib/supabase'
import { toBookRow } from './mappers'
import { booksKey } from './books'
import { profileKey, type Profile } from './profile'

export interface ReviewCandidate {
  incoming: Incoming
  existingId: string
  existingTitle: string
  existingAuthor: string
  strength: MatchStrength
}

export type IntakeOutcome = 'added' | 'merged' | 'unchanged' | 'review'
export interface IntakeResult {
  outcome: IntakeOutcome
  review?: ReviewCandidate
  bookId?: string
}

/** Verdict lookup keyed per (existing book, incoming identity). Built by loadVerdicts. */
export type VerdictLookup = Map<string, DuplicateVerdict>
export const verdictLookupKey = (bookId: string, inc: Incoming): string => `${bookId}|${importKey(inc)}`

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

/** Insert an incoming record as a brand-new book (+ its reads). Returns the row + hydrated Book. */
export async function insertNewBook(inc: Incoming, ownerId: string): Promise<{ id: string; book: Book }> {
  const book = incomingToBook(inc)
  const { data, error } = await supabase
    .from('books')
    .insert({ ...toBookRow(book), owner_id: ownerId, title: book.title })
    .select('id')
    .single()
  if (error) throw error
  const id = (data as { id: string }).id
  await insertReads(id, ownerId, inc.reads ?? [])
  return { id, book: { ...book, id, reads: inc.reads ?? [] } }
}

/** Fold an incoming record INTO an existing book (existing row survives; user fields win). */
export async function foldIn(existing: Book, inc: Incoming, ownerId: string): Promise<ImportMergeResult> {
  const result = mergeImport(existing, inc)
  if (Object.keys(result.patch).length) {
    const { error } = await supabase.from('books').update(toBookRow(result.patch)).eq('id', existing.id)
    if (error) throw error
  }
  await insertReads(existing.id, ownerId, result.newReads)
  return result
}

/**
 * Intake one incoming record against the (mutable) library snapshot. The decision is the pure
 * `decideIntake` matrix: no match → add; strong match → fold in when auto-merge is on, else
 * review; fuzzy → add (single-add) or review (import); and a remembered verdict (always-merge /
 * keep-separate) overrides. Folds preserve the existing row (id/memberships/reads survive).
 * Mutates `library` so repeated rows in one import dedupe against earlier ones.
 */
export async function applyIncoming(
  inc: Incoming,
  library: Book[],
  ownerId: string,
  opts: { fuzzy: 'review' | 'add'; autoMergeStrong?: boolean; verdicts?: VerdictLookup },
): Promise<IntakeResult> {
  const m = matchBook(inc, library)
  const verdict = m.strength !== 'none' ? (opts.verdicts?.get(verdictLookupKey(m.book.id, inc)) ?? null) : null
  const decision = decideIntake(m.strength, {
    autoMergeStrong: opts.autoMergeStrong ?? true,
    verdict,
    fuzzyMode: opts.fuzzy,
  })

  if (decision === 'add') {
    const { id, book } = await insertNewBook(inc, ownerId)
    library.push(book)
    return { outcome: 'added', bookId: id }
  }

  if (decision === 'skip') {
    return { outcome: 'unchanged', bookId: m.book.id }
  }

  if (decision === 'review') {
    return {
      outcome: 'review',
      review: {
        incoming: inc,
        existingId: m.book.id,
        existingTitle: m.book.title,
        existingAuthor: [m.book.first, m.book.last].filter(Boolean).join(' '),
        strength: m.strength,
      },
    }
  }

  // decision === 'merge'
  const result = await foldIn(m.book, inc, ownerId)
  Object.assign(m.book, result.patch)
  m.book.reads = [...m.book.reads, ...result.newReads]
  return { outcome: result.changed ? 'merged' : 'unchanged', bookId: m.book.id }
}

/** Single-intake hook for the Add / bulk paths — matches against the books cache, then writes. */
export function useIntake() {
  const qc = useQueryClient()
  return async (inc: Incoming, fuzzyMode: 'review' | 'add' = 'add'): Promise<IntakeResult> => {
    const { data: auth } = await supabase.auth.getUser()
    const ownerId = auth.user?.id
    if (!ownerId) throw new Error('Not signed in')
    const autoMergeStrong = qc.getQueryData<Profile>(profileKey)?.autoMergeDuplicates ?? true
    const library = (qc.getQueryData<Book[]>(booksKey) ?? []).map((b) => ({ ...b, reads: [...b.reads] }))
    const result = await applyIncoming(inc, library, ownerId, { fuzzy: fuzzyMode, autoMergeStrong })
    await qc.invalidateQueries({ queryKey: booksKey })
    await qc.invalidateQueries({ queryKey: ['reads', 'all'] })
    return result
  }
}
