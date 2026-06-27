import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { groupSeries, matchesFilters, sortBooks } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { useBooks, useUpdateBook } from '../data/books'
import { useFilters } from '../library/filterStore'
import { Toolbar } from '../library/Toolbar'
import { FilterPanel } from '../library/FilterPanel'
import { SeriesView } from '../library/SeriesView'
import { CoverCard } from '../components/CoverCard'

function Centered({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center text-muted">
      {children}
    </section>
  )
}

function EmptyState() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-[13px] uppercase tracking-[0.3em] text-muted">Your library</p>
      <h1
        className="mt-3 max-w-[16ch] text-balance text-[40px] italic leading-[1.05] text-ink"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
      >
        Everything you’ve read, after dark
      </h1>
      <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-muted">
        Your shelves are empty. Add your first book — scan a barcode, search by title, or import a
        Goodreads / StoryGraph export — and your home comes alive with spice, tropes, series gaps
        and rereads.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
        <Link
          to="/add"
          className="flex h-11 items-center rounded-full px-6 text-[14px] font-semibold"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
        >
          ＋ Add your first book
        </Link>
        <Link
          to="/settings"
          className="flex h-11 items-center rounded-full border border-line px-5 text-[14px] font-semibold text-ink"
          style={{ background: 'var(--field)' }}
        >
          Import a CSV
        </Link>
      </div>
    </section>
  )
}

function LibraryScreen() {
  const { data: books, isLoading, isError, error } = useBooks()
  const filters = useFilters((s) => s.filters)
  const mode = useFilters((s) => s.mode)
  const panelOpen = useFilters((s) => s.panelOpen)
  const updateBook = useUpdateBook()
  const navigate = useNavigate()

  if (isLoading) return <Centered>Gathering your library…</Centered>
  if (isError) return <Centered>Couldn’t load your library — {(error as Error).message}</Centered>
  if (!books || books.length === 0) return <EmptyState />

  const visible = sortBooks(books.filter((b) => matchesFilters(b, filters)), filters.sort)

  const openBook = (id: string) => void navigate({ to: '/book/$bookId', params: { bookId: id } })

  return (
    <section className="px-4 py-6 sm:px-6">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h1
          className="text-[22px] italic text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Library
        </h1>
        <span className="text-[12.5px] text-muted">
          {books.length} books · {books.filter((b) => b.fave).length} faves
        </span>
      </header>

      <Toolbar />
      {panelOpen && <FilterPanel books={books} />}

      <p className="mb-3 text-[12.5px] text-muted">
        {mode === 'series'
          ? `${groupSeries(visible).length} series among ${visible.length} filtered books`
          : `${visible.length} ${visible.length === 1 ? 'book' : 'books'}${
              visible.length !== books.length ? ` of ${books.length}` : ''
            }`}
      </p>

      {mode === 'series' ? (
        <SeriesView groups={groupSeries(visible)} allBooks={books} />
      ) : visible.length ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {visible.map((b) => (
            <CoverCard
              key={b.id}
              book={b}
              onOpen={() => openBook(b.id)}
              onToggleFave={() => updateBook.mutate({ id: b.id, patch: { fave: !b.fave } })}
            />
          ))}
        </div>
      ) : (
        <p className="px-2 py-10 text-center text-[14px] text-muted">No books match these filters.</p>
      )}
    </section>
  )
}

export const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'library',
  component: LibraryScreen,
})
