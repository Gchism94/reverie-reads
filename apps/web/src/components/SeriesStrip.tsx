import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { isPossessed, sortEntries, stateSuffix, type Book, type SeriesEntry } from '@reverie/core'
import { CoverImage } from './CoverImage'
import { fetchSeriesEntries } from '../data/series'
import { useBooks } from '../data/books'

/**
 * The book page's series strip (docs/archive/task-series-experience.md §4): "#3 of 7 · SeriesName" with
 * the prev/next neighbours in READING order — ghosts included, rendered as dashed slots — and
 * the whole thing a door into the series page. Read-only: never creates series rows; before a
 * series page has ever been opened it falls back to the library's own books in that series.
 */
export function SeriesStrip({ book }: { book: Book }) {
  const { data: books } = useBooks()
  const { data: fetched } = useQuery({
    queryKey: ['series-strip', book.series.toLowerCase()],
    enabled: !!book.series,
    queryFn: () => fetchSeriesEntries(book.series),
  })

  const entries: SeriesEntry[] = useMemo(() => {
    if (fetched?.length) return fetched
    // no series row yet — the library's own copies stand in
    return sortEntries(
      (books ?? [])
        .filter((b) => b.series === book.series)
        .map((b) => ({
          id: b.id,
          position: typeof b.position === 'number' ? b.position : 0,
          label: null,
          title: b.title,
          author: '',
          bookId: b.id,
          source: 'manual' as const,
          userEdited: true,
        })),
    )
  }, [fetched, books, book.series])

  if (!book.series) return null
  const byId = new Map((books ?? []).map((b) => [b.id, b]))
  const idx = entries.findIndex((e) => e.bookId === book.id)
  const prev = idx > 0 ? entries[idx - 1] : undefined
  const next = idx >= 0 && idx < entries.length - 1 ? entries[idx + 1] : undefined
  const posText =
    book.position !== '' ? `#${book.position}` : idx >= 0 ? `#${entries[idx]!.position}` : ''

  const neighbour = (e: SeriesEntry | undefined, dir: 'prev' | 'next') => {
    if (!e) return <span className="h-[54px] w-9 flex-none" aria-hidden />
    const b = e.bookId ? byId.get(e.bookId) : undefined
    return (
      <span
        className="h-[54px] w-9 flex-none overflow-hidden rounded-md border border-line"
        style={!b ? { borderStyle: 'dashed', background: 'var(--chip)' } : undefined}
        title={`${dir === 'prev' ? 'Before' : 'After'} this one: ${b?.title ?? e.title}${
          b ? stateSuffix(b) : ''
        }`}
      >
        {b ? (
          <CoverImage book={b} thumb ghost={!isPossessed(b)} />
        ) : (
          <span className="flex h-full items-center justify-center text-[13px] text-muted">⊹</span>
        )}
      </span>
    )
  }

  return (
    <Link
      to="/series/$seriesName"
      params={{ seriesName: encodeURIComponent(book.series) }}
      className="mt-2 flex items-center gap-2.5 skin-tile border border-line p-2 pr-3"
      style={{ background: 'var(--card)' }}
      aria-label={`Open the ${book.series} series page`}
    >
      {neighbour(prev, 'prev')}
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[13.5px] font-semibold text-ink"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {book.series}
        </span>
        <span className="block text-[12px] text-muted">
          {posText}
          {entries.length ? `${posText ? ' of ' : ''}${entries.length}` : ''} · see the whole series
          →
        </span>
      </span>
      {neighbour(next, 'next')}
    </Link>
  )
}
