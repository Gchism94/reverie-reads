import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  groupSeries,
  hiddenMatchCount,
  inDefaultLibrary,
  matchesFilters,
  sortBooks,
  type Book,
  type LibraryShelfLink,
} from '@reverie/core'
import { rootRoute } from './RootRoute'
import { useBooks, useUpdateBook } from '../data/books'
import { useFilters } from '../library/filterStore'
import { Toolbar } from '../library/Toolbar'
import { FilterPanel } from '../library/FilterPanel'
import { SeriesView } from '../library/SeriesView'
import { CoverCard } from '../components/CoverCard'
import { CoverSheet } from '../components/CoverSheet'
import { BookDetailRail } from '../components/BookDetailRail'
import { useIsDesktop, useIsWide } from '../hooks/useMediaQuery'
import { useVoice } from '../skin/labels'
import { SectionHeader, SignatureEmblem } from '../components/Structure'

function Centered({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center text-muted">
      {children}
    </section>
  )
}

function EmptyState() {
  // The empty state speaks in the active skin's VOICE (Tryst sultry-warm · Aphelion spacefarer-spare),
  // led by the skin's signature motif — the Skin Character voice lever, never hardcoded.
  const voice = useVoice()
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <SignatureEmblem fallback={voice.motif} size={40} />
      <h1
        className="mt-3 max-w-[18ch] text-balance text-[40px] italic leading-[1.05] text-ink"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
      >
        {voice.empty.heading}
      </h1>
      <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-muted">{voice.empty.body}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
        <Link
          to="/add"
          className="skin-control flex h-11 items-center px-6 text-[14px]"
          style={{
            background: 'linear-gradient(135deg, var(--primary), var(--gold))',
            color: 'var(--on-primary)',
          }}
        >
          ＋ {voice.empty.cta}
        </Link>
        <Link
          to="/settings"
          className="skin-control flex h-11 items-center border border-line px-5 text-[14px] text-ink"
          style={{ background: 'var(--field)' }}
        >
          Import books
        </Link>
      </div>
    </section>
  )
}

const COVER_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
  gap: '18px 16px',
}

/** Detail rail as an overlay drawer (lg→xl tier, on selection) so the cover grid keeps its columns.
 *  Modal: backdrop dismiss, Escape, focus the close button on open. Appears without motion (the panel
 *  is mounted on select), so it's inherently reduced-motion-safe. */
function DetailDrawer({
  book,
  onClose,
  onToggleFave,
}: {
  book: Book
  onClose: () => void
  onToggleFave: (id: string) => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40"
      role="dialog"
      aria-modal="true"
      aria-label={`${book.title} details`}
    >
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: 'color-mix(in srgb, var(--bg0) 55%, transparent)' }}
      />
      <div
        className="absolute right-0 top-0 flex h-dvh w-[min(360px,92vw)] flex-col border-l border-line"
        style={{ background: 'var(--bg1)', boxShadow: 'var(--shadow)' }}
      >
        <div className="flex justify-end p-2">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="grid h-8 w-8 place-items-center rounded-full border border-line text-[13px] text-ink"
            style={{ background: 'var(--card)' }}
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <BookDetailRail book={book} onToggleFave={onToggleFave} />
        </div>
      </div>
    </div>
  )
}

function LibraryScreen() {
  const { data: books, isLoading, isError, error } = useBooks()
  const filters = useFilters((s) => s.filters)
  const mode = useFilters((s) => s.mode)
  const panelOpen = useFilters((s) => s.panelOpen)
  const setShelf = useFilters((s) => s.setShelf)
  // The withheld-matches line REVEALS BY DRIVING THE CHIP — the same action ⊹ Show wishlist fires,
  // not a second switch beside it. A parallel piece of state would be free to disagree with the
  // chip (line says shown, chip says off), and the reader would have two controls for one scope.
  const toggleWishlist = useFilters((s) => s.toggleWishlist)
  const updateBook = useUpdateBook()
  const navigate = useNavigate()
  // A shelf link is a one-time arrival, not a persistent URL param: it seeds the filter store on the
  // way in (so Owned/Borrowed/Read/Wishlist land pre-filtered) and the reader can clear it like any
  // other facet from there — Clear all, or picking the same value off, both leave the URL alone.
  const { shelf } = libraryRoute.useSearch()
  useEffect(() => {
    if (shelf) setShelf(shelf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelf])
  const isDesktop = useIsDesktop() // ≥ lg: select in place (rail), else navigate to the book route
  const isWide = useIsWide() // ≥ xl: rail is a docked column, else an overlay drawer on selection
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [coverSheetId, setCoverSheetId] = useState<string | null>(null) // placeholder "add a cover"
  const voice = useVoice()

  const visible = useMemo(
    () =>
      books
        ? sortBooks(
            books.filter((b) => matchesFilters(b, filters)),
            filters.sort,
          )
        : [],
    [books, filters],
  )
  // The default library — what you have in hand (owned or borrowed) or have read. Wishlist and
  // unset-unread records join in only via the filter chip (docs/archive/task-ownership-v2.md).
  const libraryBooks = useMemo(() => (books ?? []).filter(inDefaultLibrary), [books])
  // SAY WHAT YOU SILENTLY DID.
  //
  // The scope gate above is a deliberate model and stays exactly as it is — the defect it caused
  // was never the filtering, it was the SILENCE. An exact-title query is the strongest intent
  // signal a reader can send, and a view default was overruling it with nothing on screen to say
  // so; the only escape was a chip whose label ("⊹ Show wishlist") never advertises that it
  // governs search results.
  //
  // Third surface in this app with that shape, so it is worth naming rather than fixing once more
  // in isolation. The sibling is DuplicateReview's `differs` line, which states the values a merge
  // silently kept over the ones it discarded (components/DuplicateReview.tsx). The one still
  // unnarrated is Discover's fn-down fallback, which substitutes curated content for live results
  // indistinguishably. Each does something defensible and does it quietly; the fix is never to stop
  // doing it, it is to say so — and, where there is a way to undo it, to offer that in the same
  // breath.
  //
  // Two properties this line borrows from the differs line, both load-bearing: the count is REAL
  // (hiddenMatchCount runs the books through matchesFilters itself, so it cannot disagree with the
  // grid it annotates) and it renders NOTHING at zero, which is most searches. A standing "0
  // hidden" is what teaches a reader to stop reading the line.
  const hiddenCount = useMemo(() => hiddenMatchCount(books ?? [], filters), [books, filters])

  if (isLoading) return <Centered>{voice.loading}</Centered>
  if (isError) return <Centered>Couldn’t load your library — {(error as Error).message}</Centered>
  if (!books || books.length === 0) return <EmptyState />

  const toggleFave = (id: string, fave: boolean) =>
    updateBook.mutate({ id, patch: { fave: !fave } })

  const activate = (id: string) => {
    if (isDesktop) setSelectedId(id)
    else void navigate({ to: '/book/$bookId', params: { bookId: id } })
  }

  // The "/ total" readout compares against the active scope: the default library by default,
  // everything when the wishlist chip is on.
  const baseCount = filters.wishlist ? books.length : libraryBooks.length

  const selected = (selectedId && visible.find((b) => b.id === selectedId)) || null
  const coverSheetBook = (coverSheetId && books.find((b) => b.id === coverSheetId)) || null
  // Docked rail (xl) is never empty — falls back to the first visible book. The overlay drawer (lg→xl)
  // opens only on an explicit selection. The selection ring follows whichever is showing.
  const dockedBook = selected ?? visible[0] ?? null
  const highlightId = isWide ? dockedBook?.id : selectedId

  const center = (
    <div className="min-w-0 px-4 py-6 sm:px-6 lg:px-7">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h1
          className="text-[22px] italic text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Library
        </h1>
        <span className="text-[12.5px] text-muted">
          {libraryBooks.length} books · {libraryBooks.filter((b) => b.fave).length} faves
        </span>
      </header>

      <Toolbar filterToggleClass="lg:hidden" />
      {/* Mobile filters are toggled inline; on desktop they live in the persistent left column. */}
      <div className="lg:hidden">{panelOpen && <FilterPanel books={books} />}</div>

      {hiddenCount > 0 && (
        <p
          role="status"
          data-testid="search-hidden-notice"
          className="mb-3 text-[12.5px] text-muted"
        >
          {hiddenCount} {hiddenCount === 1 ? 'match' : 'matches'} hidden by filters —{' '}
          <button
            type="button"
            data-testid="search-hidden-reveal"
            onClick={toggleWishlist}
            aria-label="Show matches hidden by filters"
            className="underline underline-offset-2"
            style={{ color: 'var(--accent-ink)' }}
          >
            show
          </button>
        </p>
      )}

      <SectionHeader
        className="mb-3"
        label={mode === 'series' ? 'Series' : 'Your library'}
        readout={
          mode === 'series'
            ? groupSeries(visible).length
            : `${visible.length}${visible.length !== baseCount ? ` / ${baseCount}` : ''}`
        }
      />

      {mode === 'series' ? (
        <SeriesView groups={groupSeries(visible)} allBooks={books} />
      ) : visible.length ? (
        <div style={COVER_GRID}>
          {visible.map((b) => (
            <CoverCard
              key={b.id}
              book={b}
              selected={isDesktop && b.id === highlightId}
              onOpen={() => activate(b.id)}
              onToggleFave={() => toggleFave(b.id, b.fave)}
              onAddCover={() => setCoverSheetId(b.id)}
            />
          ))}
        </div>
      ) : (
        <p className="px-2 py-10 text-center text-[14px] text-muted">{voice.miss}</p>
      )}
    </div>
  )

  return (
    <>
      <section className="lg:grid lg:items-start lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[236px_minmax(0,1fr)_360px]">
        {/* Filters — docked left column on desktop */}
        <aside
          aria-label="Filters"
          className="hidden lg:sticky lg:top-0 lg:block lg:h-dvh lg:overflow-y-auto lg:border-r lg:border-line lg:px-4 lg:py-6"
        >
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted">Filters</div>
          <FilterPanel books={books} bare />
        </aside>

        {center}

        {/* Detail — docked right rail at xl; between lg and xl it's the overlay drawer below */}
        <aside
          aria-label="Book details"
          className="hidden xl:sticky xl:top-0 xl:block xl:h-dvh xl:border-l xl:border-line"
        >
          <BookDetailRail
            book={dockedBook}
            onToggleFave={(id) => toggleFave(id, dockedBook?.fave ?? false)}
          />
        </aside>
      </section>

      {isDesktop && !isWide && selected && (
        <DetailDrawer
          book={selected}
          onClose={() => setSelectedId(null)}
          onToggleFave={(id) => toggleFave(id, selected.fave)}
        />
      )}

      {/* the placeholder's quiet "add a cover" affordance opens the same sheet as book detail */}
      {coverSheetBook && <CoverSheet book={coverSheetBook} onClose={() => setCoverSheetId(null)} />}
    </>
  )
}

const SHELF_LINK_VALUES: readonly LibraryShelfLink[] = ['owned', 'borrowed', 'read', 'wishlist']

export const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'library',
  // Deep link from a /shelves derived-shelf header (the AuthRoute `?mode=` pattern) — undefined
  // means "no shelf link", so plain /library stays the canonical URL.
  validateSearch: (search: Record<string, unknown>): { shelf?: LibraryShelfLink } => ({
    shelf: SHELF_LINK_VALUES.includes(search.shelf as LibraryShelfLink)
      ? (search.shelf as LibraryShelfLink)
      : undefined,
  }),
  component: LibraryScreen,
})
