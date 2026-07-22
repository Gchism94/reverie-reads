import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { contributorsFromAuthors, splitName, type Book, type Incoming } from '@reverie/core'
import { supabase } from '../lib/supabase'
import { searchEverywhere, type SearchResult } from '../lib/search'
import { enrichBook } from '../lib/enrich'
import { useIntake, type IntakeResult } from './intake'
import { booksKey } from './books'
import { allListItemsKey } from './listItems'
import { listsKey } from './lists'

// Data layer for Discover search — the query hook (shared by Discover + the shelf picker seam) and
// the add mutation (owned or unowned-to-a-shelf), both pulling FULL metadata from the source at add
// time (task §2 — no thin stubs).

/** Search the wider catalog. Pass the DEBOUNCED query; runs only at ≥3 chars (task §1). */
export function useSearchEverywhere(query: string) {
  const q = query.trim()
  return useQuery<SearchResult[]>({
    queryKey: ['search', q.toLowerCase()],
    queryFn: ({ signal }) => searchEverywhere(q, signal),
    enabled: q.length >= 3,
    // Matches the server's short TTL — reopening the same query in a session is free, and the
    // debounce's trailing duplicate never spawns a second upstream call.
    staleTime: 1000 * 60 * 5,
    retry: 1,
  })
}

/** Merge the source's full record into an add-ready Incoming (enrichment leads; the search hit fills
 *  gaps). Absent data stays absent — no fabricated genre/format (import-quality policy). */
async function buildIncoming(result: SearchResult, ownership: Book['ownership']): Promise<Incoming> {
  const enr = await enrichBook({
    title: result.title,
    author: result.authors[0],
    isbn: result.isbn13 ?? result.isbn,
  })
  const authors = enr?.authors?.length ? enr.authors : result.authors
  const primary = authors[0] ?? ''
  const { first, last } = splitName(primary)
  const series = enr?.series || result.series || ''
  const position = enr?.seriesPosition ?? result.seriesPosition ?? ''
  const yearFromResult = /^\d{4}$/.test(result.year) ? Number(result.year) : null
  return {
    title: enr?.title || result.title,
    first,
    last,
    contributors: contributorsFromAuthors(authors),
    series,
    position,
    // A book that arrives with a series is at least 'ongoing'; standalone otherwise (series-experience
    // reconciles the real status on the series page). Never fabricate a series the source didn't give.
    status: series ? 'ongoing' : 'standalone',
    genre: enr?.genre || '',
    genres: enr?.genres ?? [],
    // The external cover is stored as-is; the cover system's lazy backfill materializes it into
    // Storage on the book's first detail view (never a fabricated placeholder-as-cover).
    cover: result.cover || enr?.cover || '',
    isbn: enr?.isbn13 || enr?.isbn || result.isbn13 || result.isbn || '',
    pub: { y: enr?.pubY ?? yearFromResult, m: enr?.pubM ?? null, d: enr?.pubD ?? null },
    ownership,
    owned: { physical: false, ebook: false, audiobook: false },
    source: 'Discover',
  }
}

export interface AddFromSearchInput {
  result: SearchResult
  ownership: Book['ownership']
  /** when set, the new book is placed on this shelf/TBR after adding (unowned add-to-shelf) */
  listId?: string
}

export interface AddFromSearchResult {
  bookId: string | undefined
  outcome: IntakeResult['outcome']
}

/** Add a search result to the library (owned) or to a shelf/TBR (unowned + placed). Pulls full
 *  metadata at add time; de-dupes via the intake matcher (a book already shelved folds in rather
 *  than duplicating). Series data rides along on the book and links on the series page. */
export function useAddFromSearch() {
  const qc = useQueryClient()
  const intake = useIntake()
  return useMutation<AddFromSearchResult, Error, AddFromSearchInput>({
    mutationFn: async ({ result, ownership, listId }) => {
      const incoming = await buildIncoming(result, ownership)
      const res = await intake(incoming, 'add')
      if (listId && res.bookId) {
        const { data: auth } = await supabase.auth.getUser()
        const ownerId = auth.user?.id
        if (ownerId) {
          const { data: maxRows } = await supabase
            .from('list_items')
            .select('position')
            .eq('list_id', listId)
            .order('position', { ascending: false })
            .limit(1)
          const after = ((maxRows?.[0]?.position as number | null) ?? 0) + 1000
          await supabase
            .from('list_items')
            .upsert([{ list_id: listId, book_id: res.bookId, owner_id: ownerId, position: after }], {
              onConflict: 'list_id,book_id',
              ignoreDuplicates: true,
            })
        }
      }
      return { bookId: res.bookId, outcome: res.outcome }
    },
    onSuccess: (_r, { listId }) => {
      void qc.invalidateQueries({ queryKey: booksKey })
      if (listId) {
        void qc.invalidateQueries({ queryKey: allListItemsKey })
        void qc.invalidateQueries({ queryKey: listsKey })
      }
    },
  })
}
