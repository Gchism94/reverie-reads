import { useMemo } from 'react'
import type { Book, ReadEntry } from '@reverie/core'
import { useBooks } from './books'
import { useAllReads } from './reads'

/** A personal library with its actual reading history, for decisions that distinguish new reads
 * from rereads. The base books query deliberately does not load read rows. Missing history must
 * never be interpreted as an empty history or used to offer a previously finished book as new. */
export function useReaderBooks() {
  const books = useBooks()
  const reads = useAllReads()
  const data = useMemo((): Book[] | undefined => {
    if (!books.data || !reads.data) return undefined
    const byBook = new Map<string, ReadEntry[]>()
    for (const row of reads.data) {
      const entries = byBook.get(row.book_id) ?? []
      entries.push({
        date: row.read_on ?? '',
        format: row.format ?? '',
        rating: row.rating ?? 0,
        notes: row.notes ?? '',
      })
      byBook.set(row.book_id, entries)
    }
    return books.data.map((book) => ({ ...book, reads: byBook.get(book.id) ?? [] }))
  }, [books.data, reads.data])

  return {
    data,
    isPending: books.isPending || reads.isPending,
    isLoading: books.isLoading || reads.isLoading,
    isFetching: books.isFetching || reads.isFetching,
    isError: books.isError || reads.isError,
    isSuccess: books.isSuccess && reads.isSuccess,
    error: books.error ?? reads.error,
    refetch: () => Promise.all([books.refetch(), reads.refetch()]),
  }
}
