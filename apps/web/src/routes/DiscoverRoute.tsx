import { useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { genreKey, SKINS, SKIN_ORDER, splitName, type Book, type TasteAnchors } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { useBooks } from '../data/books'
import { useLists } from '../data/lists'
import { useEffectiveSkin, useVoice } from '../skin/labels'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useSearchEverywhere, useAddFromSearch } from '../data/search'
import { Chip } from '../components/Chip'
import { Modal } from '../components/Modal'
import { CoverImage } from '../components/CoverImage'
import { SearchResults } from '../components/SearchResults'
import type { SearchResult } from '../lib/search'
import {
  fetchDiscover,
  hitKey,
  isOwned,
  ownedKeys,
  rankHitsByTaste,
  sortByTaste,
  type DiscoverHit,
} from '../lib/discover'
import { TasteTier } from '../components/TasteTier'
import { useTasteCalibration } from '../data/taste'

// Discover (owner-approved): browse the wider catalog by world — defaulting to the room the
// reader is standing in — with every find one tap from Add. The nine genre chips are the same
// canonical genres the taxonomies key on; "owned" detection keeps your own shelves out of the way.

const GENRES: { key: string; label: string }[] = SKIN_ORDER.map((id) => ({
  key: SKINS[id].genre.toLowerCase(),
  label: SKINS[id].genre,
}))

function Card({
  hit,
  owned,
  taste,
  anchors,
}: {
  hit: DiscoverHit
  owned: boolean
  taste?: number
  anchors?: TasteAnchors | null
}) {
  const navigate = useNavigate()
  const author = hit.authors[0] ?? ''
  const year = hit.pub.slice(0, 4)
  const { first, last } = splitName(author)

  return (
    <div className="flex flex-col">
      <div
        className="aspect-[2/3] overflow-hidden rounded-[8px] border border-line"
        style={{ background: 'var(--card)' }}
      >
        {/* Same cover chain as the library grid: upgraded → original → skin placeholder, with the
            Google "no image" plate rejected on load (a Discover hit has no library id → no telemetry). */}
        <CoverImage book={{ title: hit.title, first, last, cover: hit.cover }} thumb />
      </div>
      <div className="mt-2 min-w-0">
        <div
          className="text-[13px] font-semibold leading-snug text-ink"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {hit.title}
        </div>
        <div className="truncate text-[12px] text-muted">
          {author}
          {year ? <span style={{ color: 'var(--faint, var(--muted))' }}> · {year}</span> : null}
        </div>
        {taste != null && anchors && (
          /* Tier 2b: the named taste tier (fixed per-user anchors) — stable per book, comparable
             across shelves. The anchored % rides underneath as the drill-down (tooltip), not here. */
          <div className="mt-0.5">
            <TasteTier cos={taste} anchors={anchors} />
          </div>
        )}
      </div>
      <div className="mt-1.5">
        {owned ? (
          <span className="skin-label inline-block rounded-full border border-line px-2.5 py-1 text-[11px] text-muted">
            On your shelf
          </span>
        ) : (
          <button
            type="button"
            onClick={() =>
              void navigate({
                to: '/add',
                search: {
                  title: hit.title,
                  author: author || undefined,
                  isbn: hit.isbn || undefined,
                  cover: hit.cover || undefined,
                  pub: hit.pub || undefined,
                  // Discover is a wanting context — the add form defaults to the wishlist option.
                  want: true,
                },
              })
            }
            className="skin-control border border-line px-3 py-1 text-[12px] font-semibold text-ink"
            style={{ background: 'var(--chip)' }}
          >
            ＋ Add
          </button>
        )}
      </div>
    </div>
  )
}

/** A tiny modal listing the reader's shelves/TBRs — pick one to place an unowned copy there (task §2). */
function ShelfChooser({
  onPick,
  onClose,
}: {
  onPick: (listId: string) => void
  onClose: () => void
}) {
  const { data: lists } = useLists()
  const shelves = lists ?? []
  return (
    <Modal title="Add to a shelf" onClose={onClose}>
      {shelves.length === 0 ? (
        <p className="text-[13px] text-muted">
          You don’t have any shelves yet — make one from the Shelves tab.
        </p>
      ) : (
        <ul className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto">
          {shelves.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => onPick(l.id)}
                className="flex w-full items-center justify-between skin-card border border-line px-3 py-2.5 text-left"
                style={{ background: 'var(--field)' }}
              >
                <span className="text-[13.5px] font-semibold text-ink">{l.name}</span>
                <span className="text-[11px] uppercase tracking-wide text-muted">
                  {l.kind === 'tbr' ? 'TBR' : 'Shelf'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

/** The two add actions on a Discover search result: to the library (owned) or to a shelf (unowned).
 *  A book already shelved renders its state instead (handled by SearchResults), never these. */
function ResultActions({ result }: { result: SearchResult }) {
  const add = useAddFromSearch()
  const [chooseShelf, setChooseShelf] = useState(false)
  const busy = add.isPending
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => add.mutate({ result, ownership: 'owned' })}
        className="skin-control border border-line px-3 py-1 text-[12px] font-semibold text-ink disabled:opacity-50"
        style={{ background: 'var(--chip)' }}
      >
        ＋ Add
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setChooseShelf(true)}
        className="skin-control border border-line px-3 py-1 text-[12px] font-semibold text-ink disabled:opacity-50"
        style={{ background: 'var(--field)' }}
      >
        ＋ Shelf
      </button>
      {chooseShelf && (
        <ShelfChooser
          onClose={() => setChooseShelf(false)}
          onPick={(listId) => {
            add.mutate({ result, ownership: 'wishlist', listId })
            setChooseShelf(false)
          }}
        />
      )}
    </>
  )
}

/** The Discover search surface — shown only while a query is active; the taste rail returns on clear. */
function SearchSection({ query, books }: { query: string; books: Book[] }) {
  const voice = useVoice()
  const q = useSearchEverywhere(query)
  return (
    <div>
      {q.isPending && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div
                className="aspect-[2/3] rounded-[8px] border border-line"
                style={{ background: 'var(--card)' }}
              />
              <div className="h-3 w-3/4 rounded" style={{ background: 'var(--card)' }} />
              <div className="h-3 w-1/2 rounded" style={{ background: 'var(--card)' }} />
            </div>
          ))}
        </div>
      )}
      {q.isError && (
        <div className="skin-card border border-line p-6 text-center">
          <p className="text-[14px] text-ink">Search isn’t answering right now.</p>
          <p className="mt-1 text-[12.5px] text-muted">
            Usually a rate limit — it clears on its own.
          </p>
        </div>
      )}
      {q.isSuccess && q.data.length === 0 && (
        <div className="skin-card border border-line p-6 text-center">
          <p className="text-[14px] text-ink">{voice.miss}</p>
          <p className="mt-1 text-[12.5px] text-muted">Try a title, an author, or an ISBN.</p>
        </div>
      )}
      {q.isSuccess && q.data.length > 0 && (
        <SearchResults
          results={q.data}
          books={books}
          renderActions={(r) => <ResultActions result={r} />}
        />
      )}
    </div>
  )
}

function DiscoverScreen() {
  const voice = useVoice()
  const skinGenre = SKINS[useEffectiveSkin()].genre.toLowerCase()
  const search = discoverRoute.useSearch()
  const navigate = useNavigate()
  const genre = search.genre ?? skinGenre
  const { data: books } = useBooks()
  const owned = ownedKeys(books ?? [])
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 400)
  const searching = debounced.trim().length >= 3

  const q = useQuery({
    queryKey: ['discover', genreKey(genre)],
    queryFn: ({ signal }) => fetchDiscover(genre, signal),
    staleTime: 1000 * 60 * 60 * 6, // a browse shelf, not a feed — a handful of calls per session
    retry: 1,
  })

  // Tier 2b: score the shelf against the reader's taste centroid. Unavailability (cold start /
  // fn down / budget cut) is thrown, NOT returned — returned null would be cached as data for
  // hours and keep hiding taste after the fn recovers. Errors stay silent (catalog order) and
  // retry on the next visit; taste is an enhancement, never a gate.
  const rank = useQuery({
    queryKey: ['discover-rank', genreKey(genre), (q.data ?? []).map(hitKey).join('|')],
    queryFn: async () => {
      const scores = await rankHitsByTaste(q.data ?? [], genre)
      if (!scores) throw new Error('taste unavailable')
      return scores
    },
    enabled: !!q.data?.length,
    staleTime: 1000 * 60 * 60 * 6,
    retry: 0,
  })
  // The reader's fixed display anchors — one fetch, shared by every card (TanStack dedupes the key).
  const { data: anchors } = useTasteCalibration()
  const ordered = q.data
    ? rank.data
      ? sortByTaste(q.data, rank.data)
      : q.data.map((hit) => ({ hit }) as { hit: DiscoverHit; taste?: number })
    : []

  return (
    <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <h1
        className="text-[22px] italic text-ink"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
      >
        Discover
      </h1>
      <p className="mb-4 text-[13px] text-muted">
        New and notable from the wider shelves — one tap from your library.
      </p>

      {/* Search the wider catalog — title, author, or ISBN. An active query replaces the browse rail
          below; clearing it restores the rail intact (task §4). */}
      <div className="mb-5">
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, author, or ISBN…"
            aria-label="Search the wider catalog"
            className="h-11 w-full skin-card border border-line pl-10 pr-3 text-[14px] text-ink outline-none"
            style={{ background: 'var(--field)' }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-muted"
          >
            ⌕
          </span>
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-[13px] text-muted hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>
        {query.trim().length > 0 && query.trim().length < 3 && (
          <p className="mt-1.5 text-[12px] text-muted">
            Keep typing — search starts at three letters.
          </p>
        )}
      </div>

      {/* ── search results (query active) ── */}
      {searching && <SearchSection query={debounced} books={books ?? []} />}

      {/* ── the taste-ranked browse rail (empty search) ── */}
      {!searching && (
        <>
          <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Browse a genre">
            {GENRES.map((g) => (
              <Chip
                key={g.key}
                active={g.key === genreKey(genre)}
                onClick={() =>
                  void navigate({
                    to: '/discover',
                    search: g.key === skinGenre ? {} : { genre: g.key },
                    replace: true,
                  })
                }
              >
                {g.label}
              </Chip>
            ))}
          </div>

          {q.isPending && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-hidden>
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <div
                    className="aspect-[2/3] rounded-[8px] border border-line"
                    style={{ background: 'var(--card)' }}
                  />
                  <div className="h-3 w-3/4 rounded" style={{ background: 'var(--card)' }} />
                  <div className="h-3 w-1/2 rounded" style={{ background: 'var(--card)' }} />
                </div>
              ))}
            </div>
          )}

          {q.isError && (
            <div className="skin-card border border-line p-6 text-center">
              <p className="text-[14px] text-ink">The wider shelves aren’t answering right now.</p>
              <p className="mt-1 text-[12.5px] text-muted">
                Usually a rate limit — it clears on its own.
              </p>
              <button
                type="button"
                onClick={() => void q.refetch()}
                className="skin-control mt-3 border border-line px-4 py-1.5 text-[13px] font-semibold text-ink"
                style={{ background: 'var(--chip)' }}
              >
                Try again
              </button>
            </div>
          )}

          {q.isSuccess && q.data.length === 0 && (
            <div className="skin-card border border-line p-6 text-center">
              <p className="text-[14px] text-ink">{voice.miss}</p>
              <p className="mt-1 text-[12.5px] text-muted">
                Try another genre — the smaller shelves run thin some weeks.
              </p>
            </div>
          )}

          {q.isSuccess && q.data.length > 0 && (
            <>
              {rank.data && (
                <p className="mb-3 text-[12px] text-muted">
                  Closest to your taste first — learned from the books you love.
                </p>
              )}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {ordered.map(({ hit: h, taste }) => (
                  <Card
                    key={`${h.isbn}|${h.title}`}
                    hit={h}
                    owned={isOwned(h, owned)}
                    taste={taste}
                    anchors={anchors}
                  />
                ))}
              </div>
            </>
          )}

          <p className="mt-6 text-[12px]" style={{ color: 'var(--faint, var(--muted))' }}>
            Sourced from the wider catalog — indie and KU releases can lag here. Your own shelves
            always know better.
          </p>
        </>
      )}
    </section>
  )
}

export const discoverRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'discover',
  component: DiscoverScreen,
  validateSearch: (s: Record<string, unknown>): { genre?: string } => ({
    genre: typeof s.genre === 'string' && s.genre.trim() ? genreKey(s.genre) : undefined,
  }),
})
