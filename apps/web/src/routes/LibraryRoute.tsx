import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  groupSeries,
  hiddenMatchCount,
  inDefaultLibrary,
  matchesFilters,
  sortBooks,
  withIntensityHidden,
  withIntensityHiddenSort,
  type Book,
  type LibraryShelfLink,
} from '@reverie/core'
import { rootRoute } from './RootRoute'
import { useBooks, useUpdateBook } from '../data/books'
import { useHideIntensity } from '../data/profile'
import { useFilters } from '../library/filterStore'
import { Toolbar } from '../library/Toolbar'
import { FilterPanel } from '../library/FilterPanel'
import { SeriesView } from '../library/SeriesView'
import { CoverCard } from '../components/CoverCard'
import { CoverSheet } from '../components/CoverSheet'
import { BookDetailRail } from '../components/BookDetailRail'
import { DrawerDialog } from '../components/DrawerDialog'
import {
  HouseholdBookCard,
  HouseholdBookDetail,
  LibraryScopeControl,
  type LibraryScope,
} from '../components/HouseholdLibrary'
import { Surface } from '../components/Surface'
import {
  labelHouseholdData,
  useHouseholdBookSelection,
  useHouseholdBooks,
  useHouseholdRoster,
  type HouseholdBook,
} from '../data/household'
import { useAuth } from '../auth/AuthProvider'
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

function DetailDrawer({
  book,
  onClose,
  onToggleFave,
}: {
  book: Book
  onClose: () => void
  onToggleFave: (id: string) => void
}) {
  return (
    <DrawerDialog title={`${book.title} details`} closeLabel="Close details" onClose={onClose}>
      <BookDetailRail book={book} onToggleFave={onToggleFave} />
    </DrawerDialog>
  )
}

function PersonalLibraryScreen() {
  const { data: books, isLoading, isError, error } = useBooks()
  const hideIntensity = useHideIntensity()
  /*
   * The EFFECTIVE filter state for a hidden-spice reader. Derived once, here, so every consumer
   * below — the grid, the sort, and hiddenMatchCount's badge — reads the same object and cannot
   * disagree about what is filtering. Without this, a level selected before hiding keeps
   * constraining the grid with its clear-it chip no longer on screen.
   */
  const rawFilters = useFilters((s) => s.filters)
  const filters = useMemo(
    () => withIntensityHidden(rawFilters, hideIntensity),
    [rawFilters, hideIntensity],
  )
  const sort = withIntensityHiddenSort(filters.sort, hideIntensity)
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
            sort,
          )
        : [],
    [books, filters, sort],
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

  if (isLoading) {
    return (
      <div className="flex min-h-full flex-col px-4 py-6 sm:px-6">
        <LibraryHeader scope="personal" readout="Loading…" />
        <Centered>{voice.loading}</Centered>
      </div>
    )
  }
  if (isError) {
    return (
      <div className="flex min-h-full flex-col px-4 py-6 sm:px-6">
        <LibraryHeader scope="personal" readout="Unavailable" />
        <Centered>Couldn’t load your library — {(error as Error).message}</Centered>
      </div>
    )
  }
  if (!books || books.length === 0) {
    return (
      <div className="flex min-h-full flex-col px-4 py-6 sm:px-6">
        <LibraryHeader scope="personal" readout="0 books · 0 faves" />
        <EmptyState />
      </div>
    )
  }

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
      <LibraryHeader
        scope="personal"
        readout={`${libraryBooks.length} books · ${libraryBooks.filter((b) => b.fave).length} faves`}
        className="mb-3"
      />

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
            /*
             * PRESS BEFORE THE BLUR. This control sits directly under the search box, and while
             * that box holds focus Toolbar renders SearchResultsPanel. A mousedown here blurs the
             * input, the panel unmounts mid-press, the line JUMPS UP into the space the panel was
             * occupying, and mouseup therefore lands on a different element than mousedown — the
             * browser fires `click` on their common ancestor instead of on this button. The
             * reader's first press does nothing on the one path this feature is for: type a query,
             * read the line, press "show".
             *
             * RIGHT ANSWER, WRONG REASON — corrected from this commit's own first description,
             * which said the panel was absolutely positioned and the button was vaguely
             * "re-laid-out". The fix below was correct; the mechanism given for it was not, and a
             * reviewer navigating by it would carry the wrong model of the whole `Frame` thread.
             * What is actually true, measured on `feat/search-withheld-notice` (dd7e287):
             * `SearchResultsPanel` is handed `absolute` in its className but `Frame` also applies
             * `relative`, and `relative` WINS — so the panel is IN FLOW and reserves 77.8px of
             * vertical space. Removing it collapses that space and this line moves top 246.75 →
             * 169.0 mid-gesture. Vertical overlap between panel and line measures 0.0px, so there
             * was never any occlusion to work around.
             *
             * The original reading came from reading a CLASS STRING (`absolute left-0 right-0
             * z-30`) instead of a computed style — the exact proxy this repo's own testing rules
             * warn about, committed while writing a comment about measuring rather than reasoning.
             *
             * The observations that were right and still stand: with a plain onClick, native
             * listeners recorded `pointerdown` and `mousedown` and then neither `mouseup` nor
             * `click`, and `document.elementFromPoint` at the button's centre returned the button
             * itself — nothing was intercepting it.
             *
             * SearchResultsPanel's own rows already carry this guard, with the same reason in a
             * comment ("mousedown so the pick lands before the input's blur closes the panel").
             * Second control to need it, which makes it a property of sitting under that panel.
             *
             * onClick stays: it is what the keyboard uses, and the keyboard never takes this path.
             */
            onMouseDown={(e) => e.preventDefault()}
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
              hideIntensity={hideIntensity}
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

function ScopeSwitch({ scope }: { scope: LibraryScope }) {
  const navigate = useNavigate()
  const setScope = (next: LibraryScope) =>
    void navigate({
      to: '/library',
      search: next === 'household' ? { scope: 'household' } : {},
      replace: true,
    })
  return <LibraryScopeControl scope={scope} onChange={setScope} />
}

function LibraryHeader({
  scope,
  readout,
  className = '',
}: {
  scope: LibraryScope
  readout: string
  className?: string
}) {
  return (
    <header className={`${className} flex flex-wrap items-center justify-between gap-3`}>
      <div>
        <h1
          className="text-[22px] italic text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Library
        </h1>
        <span className="text-[12.5px] text-muted">{readout}</span>
      </div>
      <ScopeSwitch scope={scope} />
    </header>
  )
}

function HouseholdCentered({ children }: { children: ReactNode }) {
  return (
    <Surface
      tone="field"
      radius="panel"
      pad={5}
      className="mx-auto my-10 max-w-xl text-center text-[14px] text-muted"
    >
      {children}
    </Surface>
  )
}

function HouseholdDetailDrawer({
  book,
  currentReaderId,
  onClose,
}: {
  book: HouseholdBook
  currentReaderId: string
  onClose: () => void
}) {
  return (
    <DrawerDialog
      title={`${book.title} household details`}
      closeLabel="Close household details"
      onClose={onClose}
    >
      <HouseholdBookDetail book={book} currentReaderId={currentReaderId} />
    </DrawerDialog>
  )
}

function HouseholdLibraryScreen() {
  const { session } = useAuth()
  const currentReaderId = session?.user.id ?? ''
  const roster = useHouseholdRoster()
  // The roster response is the authorization decision. While it is revalidating, there is no
  // authorized household id and therefore no book query capable of repainting an earlier scope.
  const householdId =
    !roster.isFetching && !roster.error ? (roster.data?.[0]?.householdId ?? null) : null
  const householdBooks = useHouseholdBooks(householdId)
  const isWide = useIsWide()

  const labelled = useMemo(
    () => labelHouseholdData(roster.data ?? [], householdBooks.data ?? []),
    [roster.data, householdBooks.data],
  )
  const members = labelled.members
  const books = labelled.books
  const isLoading = roster.isFetching || (!!householdId && householdBooks.isFetching)
  const error = roster.error ?? householdBooks.error
  const isSettled = !isLoading && !error
  const hasHousehold = isSettled && members.length > 0
  const availableBooks = useMemo(() => (hasHousehold ? books : []), [books, hasHousehold])
  const selection = useHouseholdBookSelection({
    householdId,
    books: availableBooks,
    authorized: hasHousehold,
  })
  const selected = selection.selected

  const dockedBook =
    isWide && availableBooks.length > 0 ? (selected ?? availableBooks[0] ?? null) : null
  const onlyCurrentMember =
    hasHousehold &&
    members.length === 1 &&
    !!currentReaderId &&
    members[0]?.userId === currentReaderId
  const householdName = hasHousehold ? (members[0]?.householdName ?? 'Household') : 'Household'

  const center = (
    <div className="min-w-0 px-4 py-6 sm:px-6 lg:px-7">
      <LibraryHeader scope="household" readout="Household · read-only" className="mb-4" />

      {isLoading ? (
        <HouseholdCentered>Loading the household library…</HouseholdCentered>
      ) : error ? (
        <HouseholdCentered>
          Couldn’t load the household library — {(error as Error).message}
        </HouseholdCentered>
      ) : members.length === 0 ? (
        <HouseholdCentered>
          <h2 className="text-[18px] font-semibold text-ink">No household linked</h2>
          <p className="mt-2">
            This account is not part of a household. Personal remains your active library.
          </p>
        </HouseholdCentered>
      ) : (
        <>
          <Surface tone="field" radius="panel" pad={2} className="mb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">{householdName}</h2>
                <p className="mt-0.5 text-[12px] text-muted">
                  {members.length} {members.length === 1 ? 'member' : 'members'} · every card names
                  its personal-library owner
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5" aria-label="Household members">
                {members.map((member) => (
                  <span
                    key={member.userId}
                    className="skin-control px-2.5 py-1 text-[11.5px] font-semibold text-ink"
                    style={{ background: 'var(--chip)' }}
                  >
                    {member.displayName}
                    {member.userId === currentReaderId ? ' (you)' : ''}
                  </span>
                ))}
              </div>
            </div>
          </Surface>

          {onlyCurrentMember ? (
            <Surface
              tone="field"
              radius="control"
              pad={2}
              role="status"
              className="mb-4 text-[12.5px] text-muted"
            >
              You’re the only household member left. This scope stays read-only and now contains
              only your personal library.
            </Surface>
          ) : null}

          {availableBooks.length === 0 ? (
            <HouseholdCentered>
              <h2 className="text-[18px] font-semibold text-ink">
                {onlyCurrentMember ? 'Your household library is empty' : 'No household books yet'}
              </h2>
              <p className="mt-2">
                {onlyCurrentMember
                  ? 'You’re the only member left, and your personal library has no books to show here.'
                  : 'The household is linked, but none of its members has a library book to show.'}
              </p>
            </HouseholdCentered>
          ) : (
            <>
              <SectionHeader
                label="Household library"
                readout={availableBooks.length}
                className="mb-3"
              />
              <div style={COVER_GRID}>
                {availableBooks.map((book) => (
                  <HouseholdBookCard
                    key={book.id}
                    book={book}
                    currentReaderId={currentReaderId}
                    selected={isWide && dockedBook?.id === book.id}
                    onOpen={() => selection.open(book.id)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )

  return (
    <>
      <section
        className={
          dockedBook ? 'xl:grid xl:items-start xl:grid-cols-[minmax(0,1fr)_360px]' : undefined
        }
      >
        {center}
        {dockedBook ? (
          <aside
            aria-label="Household book details"
            className="hidden xl:sticky xl:top-0 xl:block xl:h-dvh xl:border-l xl:border-line"
          >
            <HouseholdBookDetail book={dockedBook} currentReaderId={currentReaderId} />
          </aside>
        ) : null}
      </section>
      {!isWide && selected ? (
        <HouseholdDetailDrawer
          book={selected}
          currentReaderId={currentReaderId}
          onClose={selection.clear}
        />
      ) : null}
    </>
  )
}

function LibraryScreen() {
  const { scope } = libraryRoute.useSearch()
  return scope === 'household' ? <HouseholdLibraryScreen /> : <PersonalLibraryScreen />
}

const SHELF_LINK_VALUES: readonly LibraryShelfLink[] = ['owned', 'borrowed', 'read', 'wishlist']

export interface LibraryRouteSearch {
  shelf?: LibraryShelfLink
  scope?: 'household'
}

export const validateLibrarySearch = (search: Record<string, unknown>): LibraryRouteSearch => ({
  shelf: SHELF_LINK_VALUES.includes(search.shelf as LibraryShelfLink)
    ? (search.shelf as LibraryShelfLink)
    : undefined,
  // Personal is represented by absence. Every unknown or array-valued input fails closed to it.
  scope: search.scope === 'household' ? 'household' : undefined,
})

export const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'library',
  // Deep link from a /shelves derived-shelf header (the AuthRoute `?mode=` pattern) — undefined
  // means "no shelf link", so plain /library stays the canonical URL.
  validateSearch: validateLibrarySearch,
  component: LibraryScreen,
})
