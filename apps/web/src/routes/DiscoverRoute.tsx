import { useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { genreKey, SKINS, SKIN_ORDER, splitName } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { useBooks } from '../data/books'
import { useEffectiveSkin, useVoice } from '../skin/labels'
import { Chip } from '../components/Chip'
import { CoverPlaceholder } from '../components/CoverPlaceholder'
import { fetchDiscover, hitKey, isOwned, ownedKeys, rankHitsByTaste, sortByTaste, tastePercent, type DiscoverHit } from '../lib/discover'

// Discover (owner-approved): browse the wider catalog by world — defaulting to the room the
// reader is standing in — with every find one tap from Add. The nine genre chips are the same
// canonical genres the taxonomies key on; "owned" detection keeps your own shelves out of the way.

const GENRES: { key: string; label: string }[] = SKIN_ORDER.map((id) => ({
  key: SKINS[id].genre.toLowerCase(),
  label: SKINS[id].genre,
}))

function Card({ hit, owned, taste }: { hit: DiscoverHit; owned: boolean; taste?: number }) {
  const navigate = useNavigate()
  const [coverFailed, setCoverFailed] = useState(false)
  const author = hit.authors[0] ?? ''
  const year = hit.pub.slice(0, 4)
  const { first, last } = splitName(author)

  return (
    <div className="flex flex-col">
      <div className="aspect-[2/3] overflow-hidden rounded-[8px] border border-line" style={{ background: 'var(--card)' }}>
        {hit.cover && !coverFailed ? (
          <img
            src={hit.cover}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <CoverPlaceholder book={{ title: hit.title, first, last }} />
        )}
      </div>
      <div className="mt-2 min-w-0">
        <div className="text-[13px] font-semibold leading-snug text-ink" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {hit.title}
        </div>
        <div className="truncate text-[12px] text-muted">
          {author}
          {year ? <span style={{ color: 'var(--faint, var(--muted))' }}> · {year}</span> : null}
        </div>
        {taste != null && (
          /* Tier 2b: closeness to the reader's own taste centroid — personal, never an average */
          <div className="text-[10.5px] font-bold text-primary">{tastePercent(taste)}% you</div>
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

function DiscoverScreen() {
  const voice = useVoice()
  const skinGenre = SKINS[useEffectiveSkin()].genre.toLowerCase()
  const search = discoverRoute.useSearch()
  const navigate = useNavigate()
  const genre = search.genre ?? skinGenre
  const { data: books } = useBooks()
  const owned = ownedKeys(books ?? [])

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
  const ordered = q.data ? (rank.data ? sortByTaste(q.data, rank.data) : q.data.map((hit) => ({ hit }) as { hit: DiscoverHit; taste?: number })) : []

  return (
    <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <h1 className="text-[22px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
        Discover
      </h1>
      <p className="mb-4 text-[13px] text-muted">New and notable from the wider shelves — one tap from your library.</p>

      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Browse a genre">
        {GENRES.map((g) => (
          <Chip
            key={g.key}
            active={g.key === genreKey(genre)}
            onClick={() => void navigate({ to: '/discover', search: g.key === skinGenre ? {} : { genre: g.key }, replace: true })}
          >
            {g.label}
          </Chip>
        ))}
      </div>

      {q.isPending && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="aspect-[2/3] rounded-[8px] border border-line" style={{ background: 'var(--card)' }} />
              <div className="h-3 w-3/4 rounded" style={{ background: 'var(--card)' }} />
              <div className="h-3 w-1/2 rounded" style={{ background: 'var(--card)' }} />
            </div>
          ))}
        </div>
      )}

      {q.isError && (
        <div className="skin-card border border-line p-6 text-center">
          <p className="text-[14px] text-ink">The wider shelves aren’t answering right now.</p>
          <p className="mt-1 text-[12.5px] text-muted">Usually a rate limit — it clears on its own.</p>
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
          <p className="mt-1 text-[12.5px] text-muted">Try another genre — the smaller shelves run thin some weeks.</p>
        </div>
      )}

      {q.isSuccess && q.data.length > 0 && (
        <>
          {rank.data && (
            <p className="mb-3 text-[12px] text-muted">Closest to your taste first — learned from the books you love.</p>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {ordered.map(({ hit: h, taste }) => (
              <Card key={`${h.isbn}|${h.title}`} hit={h} owned={isOwned(h, owned)} taste={taste} />
            ))}
          </div>
        </>
      )}

      <p className="mt-6 text-[12px]" style={{ color: 'var(--faint, var(--muted))' }}>
        Sourced from the wider catalog — indie and KU releases can lag here. Your own shelves always know better.
      </p>
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
