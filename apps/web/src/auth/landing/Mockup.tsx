import { useState } from 'react'
import type { SkinId } from '@reverie/core'
import { CoverPlaceholder } from '../../components/CoverPlaceholder'

/** A lightweight, token-only app mockup for the landing — a browser-chrome frame around a tiny
 *  Reverie preview. Chrome reads CSS vars exclusively, so wrapping it in a `data-skin` /
 *  `data-mode` scope RE-THEMES it live — that's how the skin showcase shows the real skins.
 *
 *  The shelves hold REAL books from the founding corpus (data/personal_seed.json) wearing their
 *  REAL covers — self-hosted thumbnails under public/landing-covers (no third-party image requests
 *  on the front door; the B&N CDN 403s hotlinks). In the showcase (`skin` set), a few books render
 *  the skin's placeholder plate instead — the same CoverPlaceholder component the app ships — so
 *  each room's cover identity is on display next to the cover art, exactly like a live library.
 *  The gold-brand hero (no `skin`) shows all ten covers. */
const NAV = ['Home', 'Library', 'Shelves', 'Planner', 'Stats'] as const

interface LandingBook {
  id: string
  title: string
  first: string
  last: string
  /** in the showcase, render the skin's placeholder plate instead of the cover (the "no jacket
   *  yet" state — the plates ARE the demo); the hero always shows the real cover */
  plate: boolean
}

const READING: LandingBook[] = [
  {
    id: 'acotar',
    title: 'A Court of Thorns and Roses',
    first: 'Sarah J.',
    last: 'Maas',
    plate: true,
  },
  { id: 'king-of-wrath', title: 'King of Wrath', first: 'Ana', last: 'Huang', plate: false },
  { id: 'everflame', title: 'Spark of the Everflame', first: 'Penn', last: 'Cole', plate: false },
  { id: 'never-king', title: 'The Never King', first: 'Nikki', last: 'St. Crowe', plate: true },
]

// Plates carry multi-word titles only: the plate's one-word big-type floor (fine at app thumb
// sizes) clips mid-word inside these very small landing tiles.
const SHELF: LandingBook[] = [
  {
    id: 'throne-of-glass',
    title: 'Throne of Glass',
    first: 'Sarah J.',
    last: 'Maas',
    plate: false,
  },
  {
    id: 'feathers-so-vicious',
    title: 'Feathers So Vicious',
    first: 'Liv',
    last: 'Zander',
    plate: true,
  },
  { id: 'mile-high', title: 'Mile High', first: 'Liz', last: 'Tomforde', plate: false },
  {
    id: 'love-and-other-killers',
    title: 'Love and Other Killers',
    first: 'Brynne',
    last: 'Weaver',
    plate: true,
  },
  { id: 'consider-me', title: 'Consider Me', first: 'Becka', last: 'Mack', plate: false },
  { id: 'carnage', title: 'Carnage', first: 'Shantel', last: 'Tessier', plate: false },
]

/** The real cover, from the self-hosted thumbs; falls back to the token-tinted Jacket if an image
 *  ever fails to load, so a shelf never shows a broken-image glyph. */
function CoverArt({ book, i }: { book: LandingBook; i: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <Jacket book={book} i={i} />
  return (
    <img
      src={`/landing-covers/${book.id}.jpg`}
      alt=""
      loading="lazy"
      decoding="async"
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  )
}

/** Fallback-only tile: a stylized jacket in the scope's own tokens — title type over a
 *  primary/violet/gold wash, rotating recipes so a shelf reads varied. Ink tracks the mode because
 *  the wash is mixed with --card. Decorative (the Mockup root carries the aria-label). */
function Jacket({ book, i }: { book: LandingBook; i: number }) {
  const washes = [
    'linear-gradient(150deg, color-mix(in srgb, var(--primary) 68%, var(--card)), color-mix(in srgb, var(--violet, var(--primary)) 56%, var(--card)))',
    'linear-gradient(160deg, color-mix(in srgb, var(--violet, var(--primary)) 62%, var(--card)), color-mix(in srgb, var(--primary) 30%, var(--card)))',
    'linear-gradient(145deg, color-mix(in srgb, var(--gold, var(--primary)) 46%, var(--card)), color-mix(in srgb, var(--primary) 42%, var(--card)))',
  ]
  return (
    <div
      aria-hidden
      className="flex h-full w-full flex-col justify-end overflow-hidden p-[8%]"
      style={{ background: washes[i % washes.length], containerType: 'inline-size' }}
    >
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontStyle: 'italic',
          fontSize: 'clamp(8px, 12cqw, 14px)',
          lineHeight: 1.16,
          color: 'var(--ink)',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {book.title}
      </span>
      <span
        className="mt-[5%] uppercase"
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
          fontSize: 'clamp(6px, 6.5cqw, 8px)',
          letterSpacing: '0.14em',
          color: 'color-mix(in srgb, var(--ink) 76%, transparent)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {book.first} {book.last}
      </span>
    </div>
  )
}

function Tile({
  book,
  i,
  skin,
  className = '',
}: {
  book: LandingBook
  i: number
  skin?: SkinId
  className?: string
}) {
  return (
    <div
      className={`aspect-[2/3] min-w-0 flex-1 overflow-hidden rounded-[5px] border ${className}`}
      style={{ borderColor: 'var(--line)' }}
    >
      {skin && book.plate ? (
        <CoverPlaceholder book={book} skin={skin} />
      ) : (
        <CoverArt book={book} i={i} />
      )}
    </div>
  )
}

function Shelf({ label, books, skin }: { label: string; books: LandingBook[]; skin?: SkinId }) {
  return (
    <div>
      <div
        className="mb-1.5 text-[8px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: 'var(--muted)' }}
      >
        {label}
      </div>
      <div className="flex gap-1.5">
        {books.map((b, i) => (
          /* a row of 6 drops to ~47px tiles on phones — too small for the plates' type; show 4 */
          <Tile key={b.id} book={b} i={i} skin={skin} className={i >= 4 ? 'hidden sm:block' : ''} />
        ))}
      </div>
    </div>
  )
}

export function Mockup({ ariaLabel, skin }: { ariaLabel?: string; skin?: SkinId }) {
  return (
    <div
      role="img"
      aria-label={ariaLabel ?? 'Reverie app preview'}
      className="overflow-hidden rounded-2xl border"
      style={{ background: 'var(--bg0)', borderColor: 'var(--line)', boxShadow: 'var(--shadow)' }}
    >
      {/* browser chrome */}
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
      >
        <span className="flex gap-1.5" aria-hidden>
          {['var(--primary)', 'var(--gold)', 'var(--violet, var(--muted))'].map((c, i) => (
            <span
              key={i}
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: c, opacity: 0.7 }}
            />
          ))}
        </span>
        <span
          className="ml-2 flex-1 rounded-full px-3 py-1 text-[9px]"
          style={{
            background: 'var(--field)',
            color: 'var(--muted)',
            border: '1px solid var(--line)',
          }}
        >
          Search your library… ⌘K
        </span>
      </div>

      <div className="flex">
        {/* sidebar */}
        <div
          className="amside hidden w-[92px] shrink-0 flex-col gap-1 border-r p-3 sm:flex"
          style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
        >
          {NAV.map((n, i) => (
            <span
              key={n}
              className="rounded-md px-2 py-1 text-[9px] font-medium"
              style={
                i === 1
                  ? {
                      background: 'color-mix(in srgb, var(--primary) 16%, transparent)',
                      color: 'var(--ink)',
                    }
                  : { color: 'var(--muted)' }
              }
            >
              {n}
            </span>
          ))}
        </div>

        {/* main panel */}
        <div className="min-w-0 flex-1 p-4">
          <div
            className="text-[13px] leading-tight"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--ink)' }}
          >
            Good evening, reader
          </div>
          <div className="mt-0.5 text-[9.5px]" style={{ color: 'var(--muted)' }}>
            You’re 34 books into your year of 60.
          </div>
          <div className="mt-3 flex flex-col gap-3">
            <Shelf label="Currently reading" books={READING} skin={skin} />
            <Shelf label="On your shelf" books={SHELF} skin={skin} />
          </div>
        </div>
      </div>
    </div>
  )
}
