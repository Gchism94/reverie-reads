import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Book, CoverSource } from '@reverie/core'
import { fetchEditions, ingestCover, type EditionOption } from '../lib/covers'
import { clearCoverBroken } from './brokenCovers'
import { useUpdateBook } from './books'

// Data layer for the cover sheet: the editions query (lazy — only while the sheet is open) and the
// set-cover mutation that runs the ingest pipeline then persists the stored asset + provenance via
// the normal RLS-checked book mutation. User picks always set cover_user_chosen (the non-overwrite
// flag) and CLEAR cover_confidence (null = trusted, never flagged in import review).

export function useEditionOptions(book: Book, enabled: boolean) {
  const author = [book.first, book.last].filter(Boolean).join(' ')
  return useQuery<EditionOption[]>({
    queryKey: ['editions', book.id],
    queryFn: () => fetchEditions({ isbn: book.isbn || undefined, title: book.title, author }),
    enabled: enabled && !!(book.isbn || book.title),
    staleTime: 5 * 60 * 1000,
  })
}

export interface SetCoverInput {
  /** only the id is needed — ingest scopes storage by the signed-in user, RLS checks the patch */
  book: { id: string }
  source: CoverSource
  file?: Blob
  url?: string
  sourceUrl?: string
  /** false for the lazy backfill (provenance move, not a reader choice) */
  userChosen?: boolean
}

export type SetCoverError = 'not_an_image' | 'too_large' | 'fetch_failed' | 'failed'

/** Ingest + persist. Resolves with the stored URLs; rejects with a SetCoverError code string. */
export function useSetCover() {
  const qc = useQueryClient()
  const update = useUpdateBook()
  return useMutation({
    mutationFn: async ({ book, source, file, url, sourceUrl, userChosen = true }: SetCoverInput) => {
      const outcome = await ingestCover({ bookId: book.id, source, file, url, sourceUrl })
      if (outcome.status === 'error') throw new Error(outcome.code)
      const d = outcome.data
      await update.mutateAsync({
        id: book.id,
        patch: {
          cover: d.cover,
          coverThumb: d.thumb,
          coverSource: source,
          coverSourceUrl: d.sourceUrl ?? undefined,
          coverColor: d.color ?? undefined,
          ...(userChosen ? { coverUserChosen: true, coverConfidence: undefined } : {}),
        },
      })
      clearCoverBroken(book.id)
      return d
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['books'] })
    },
  })
}

/** The optional one-tap "also update edition details" sync — offered, never forced. */
export function editionSyncPatch(book: Book, e: EditionOption): Partial<Book> {
  const patch: Partial<Book> = {}
  const isbn = e.isbn13 || e.isbn10
  if (isbn && isbn !== book.isbn) patch.isbn = isbn
  const format = mapEditionFormat(e.format)
  if (format && format !== book.format) patch.format = format
  if (e.year && e.year !== book.pub.y) patch.pub = { ...book.pub, y: e.year }
  return patch
}

/** Map a source's edition/reading format label onto the app's FORMATS vocabulary (best-effort). */
export function mapEditionFormat(raw?: string): string | null {
  if (!raw) return null
  const f = raw.toLowerCase()
  if (f.includes('audio')) return 'Audiobook'
  if (f.includes('hardcover') || f.includes('hardback')) return 'Hardcover'
  if (f.includes('paperback') || f.includes('mass market') || f.includes('softcover')) return 'Paperback'
  if (f.includes('ebook') || f.includes('e-book') || f.includes('kindle') || f.includes('digital')) return 'eBook'
  return null
}
