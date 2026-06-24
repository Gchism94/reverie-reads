import { createRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { rootRoute } from './RootRoute'
import { useBooks, useUpdateBook } from '../data/books'
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
        Mark a book “Reading” and your home comes alive — spice, tropes, series gaps and
        rereads, all in one place.
      </p>
    </section>
  )
}

function LibraryScreen() {
  const { data: books, isLoading, isError, error } = useBooks()
  const updateBook = useUpdateBook()

  if (isLoading) return <Centered>Gathering your library…</Centered>
  if (isError) return <Centered>Couldn’t load your library — {(error as Error).message}</Centered>
  if (!books || books.length === 0) return <EmptyState />

  return (
    <section className="px-4 py-6 sm:px-6">
      <header className="mb-4 flex items-baseline justify-between">
        <h1
          className="text-[22px] italic text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Library
        </h1>
        <span className="text-[12.5px] text-muted">{books.length} books</span>
      </header>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {books.map((b) => (
          <CoverCard
            key={b.id}
            book={b}
            onToggleFave={() => updateBook.mutate({ id: b.id, patch: { fave: !b.fave } })}
          />
        ))}
      </div>
    </section>
  )
}

export const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LibraryScreen,
})
