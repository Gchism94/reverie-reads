import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { splitName } from '@reverie/core'
import { useBooks } from '../data/books'
import {
  releaseWindow,
  useAuthorFollows,
  useAuthorReleases,
  useSetFollow,
  yourAuthors,
  type AuthorRelease,
} from '../data/releases'
import { CoverImage } from '../components/CoverImage'
import { Chip } from '../components/Chip'

// "Coming soon from your authors" (owner-approved releases run): the external half of the
// Releases tab. The library derives the author list; the releases fn serves each author's shelf
// from the shared cache; anything you already own stays out of the way. Every card is one tap
// from Add. Honest by design: coverage follows the catalog (indie/KU dates often surface late).

function ReleaseCard({ r }: { r: AuthorRelease }) {
  const navigate = useNavigate()
  const { first, last } = splitName(r.author)
  return (
    <button
      type="button"
      onClick={() =>
        void navigate({
          to: '/add',
          search: {
            title: r.title,
            author: r.author || undefined,
            isbn: r.isbn || undefined,
            cover: r.cover || undefined,
            pub: r.pub || undefined,
          },
        })
      }
      className="text-left"
      aria-label={`Add ${r.title}`}
    >
      <div
        className="aspect-[2/3] overflow-hidden rounded-lg border border-line"
        style={{ background: 'var(--field)' }}
      >
        {/* CoverImage handles dead links AND the Google "no image" plate, degrading to the placeholder */}
        <CoverImage book={{ title: r.title, first, last, cover: r.cover }} thumb />
      </div>
      <div className="mt-1 break-words text-[12px] font-semibold text-ink">{r.title}</div>
      <div className="break-words text-[11px] text-muted">{r.author}</div>
      <div className="text-[11px] text-primary">📅 {r.pub}</div>
    </button>
  )
}

export function FromYourAuthors() {
  const { data: books } = useBooks()
  const followsQ = useAuthorFollows()
  const setFollow = useSetFollow()
  const follows = followsQ.data ?? {}
  const authors = yourAuthors(books ?? [], follows)
  const shelves = useAuthorReleases(authors)
  const { upcoming, recent } = releaseWindow(shelves, books ?? [], Date.now())
  const [manageOpen, setManageOpen] = useState(false)

  if (!authors.length) return null

  const Section = ({ title, sub, list }: { title: string; sub: string; list: AuthorRelease[] }) =>
    list.length ? (
      <div className="mb-6">
        <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
        <p className="mb-2 text-[12.5px] text-muted">{sub}</p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {list.slice(0, 12).map((r) => (
            <ReleaseCard key={`${r.isbn}|${r.title}`} r={r} />
          ))}
        </div>
      </div>
    ) : null

  return (
    <div className="mb-8">
      <Section
        title="Coming soon from your authors"
        sub="Not on your shelves yet — tap to add"
        list={upcoming}
      />
      <Section title="New from your authors" sub="Out in the last six months" list={recent} />

      <button
        type="button"
        onClick={() => setManageOpen((o) => !o)}
        className="text-[12.5px] font-semibold text-primary"
      >
        {manageOpen ? 'Hide your authors' : `Your authors (${authors.length}) — manage`}
      </button>
      {manageOpen && (
        <div className="mt-2 flex flex-wrap gap-2">
          {authors.map((name) => (
            <Chip
              key={name}
              active
              onClick={() => setFollow.mutate({ name, state: 'muted' })}
              title={`Mute ${name}`}
            >
              {name} ✕
            </Chip>
          ))}
          {Object.entries(follows)
            .filter(([, s]) => s === 'muted')
            .map(([name]) => (
              <Chip
                key={name}
                onClick={() => setFollow.mutate({ name, state: null })}
                title={`Unmute ${name}`}
              >
                {name} — muted
              </Chip>
            ))}
        </div>
      )}
      {upcoming.length === 0 && recent.length === 0 && (
        <p className="mt-2 text-[12.5px] text-muted">
          Nothing new from your authors right now — indie release dates often surface late, so check
          back.
        </p>
      )}
    </div>
  )
}
