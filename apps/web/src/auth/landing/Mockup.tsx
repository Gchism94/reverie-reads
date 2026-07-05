import type { SkinId } from '@reverie/core'
import { CoverPlaceholder } from '../../components/CoverPlaceholder'

/** A lightweight, token-only app mockup for the landing — a browser-chrome frame around a tiny
 *  Reverie preview. It reads CSS vars exclusively (no hardcoded colours, no external images), so
 *  wrapping it in a `data-skin` / `data-mode` scope RE-THEMES it live — that's how the skin showcase
 *  shows the real skins.
 *
 *  The shelves hold REAL titles from the founding corpus (data/personal_seed.json), not colored
 *  rectangles. Books split the way a real library renders: some wear a stylized token-tinted
 *  JACKET (the "has a cover" state — we never ship actual cover art on the marketing page), the
 *  rest render the skin's REAL placeholder plate — the same CoverPlaceholder component the app
 *  ships — so each room's cover identity is on display. `skin` opts into the plates (the showcase,
 *  which provides that skin's token scope); without it (the gold-brand hero, which has no --ph-*
 *  tokens) every book wears a jacket. */
const NAV = ['Home', 'Library', 'Shelves', 'Planner', 'Stats'] as const

interface LandingBook {
  id: string
  title: string
  first: string
  last: string
  /** wears a stylized jacket (true) or renders the skin's placeholder plate (false) */
  jacket: boolean
}

const READING: LandingBook[] = [
  { id: 'acotar', title: 'A Court of Thorns and Roses', first: 'Sarah J.', last: 'Maas', jacket: false },
  { id: 'king-of-wrath', title: 'King of Wrath', first: 'Ana', last: 'Huang', jacket: true },
  { id: 'everflame', title: 'Spark of the Everflame', first: 'Penn', last: 'Cole', jacket: true },
  { id: 'never-king', title: 'The Never King', first: 'Nikki', last: 'St. Crowe', jacket: false },
]

// Plates carry multi-word titles only: the plate's one-word big-type floor (fine at app thumb
// sizes) clips mid-word inside these very small landing tiles. One-word titles ride as jackets.
const SHELF: LandingBook[] = [
  { id: 'throne-of-glass', title: 'Throne of Glass', first: 'Sarah J.', last: 'Maas', jacket: true },
  { id: 'feathers-so-vicious', title: 'Feathers So Vicious', first: 'Liv', last: 'Zander', jacket: false },
  { id: 'mile-high', title: 'Mile High', first: 'Liz', last: 'Tomforde', jacket: true },
  { id: 'love-and-other-killers', title: 'Love and Other Killers', first: 'Brynne', last: 'Weaver', jacket: false },
  { id: 'consider-me', title: 'Consider Me', first: 'Becka', last: 'Mack', jacket: true },
  { id: 'carnage', title: 'Carnage', first: 'Shantel', last: 'Tessier', jacket: true },
]

/** The "has a cover" tile: a stylized jacket in the scope's own tokens — title type over a
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

function Tile({ book, i, skin, className = '' }: { book: LandingBook; i: number; skin?: SkinId; className?: string }) {
  return (
    <div
      className={`aspect-[2/3] min-w-0 flex-1 overflow-hidden rounded-[5px] border ${className}`}
      style={{ borderColor: 'var(--line)' }}
    >
      {skin && !book.jacket ? <CoverPlaceholder book={book} skin={skin} /> : <Jacket book={book} i={i} />}
    </div>
  )
}

function Shelf({ label, books, skin }: { label: string; books: LandingBook[]; skin?: SkinId }) {
  return (
    <div>
      <div className="mb-1.5 text-[8px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--muted)' }}>
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
      <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
        <span className="flex gap-1.5" aria-hidden>
          {['var(--primary)', 'var(--gold)', 'var(--violet, var(--muted))'].map((c, i) => (
            <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: c, opacity: 0.7 }} />
          ))}
        </span>
        <span
          className="ml-2 flex-1 rounded-full px-3 py-1 text-[9px]"
          style={{ background: 'var(--field)', color: 'var(--muted)', border: '1px solid var(--line)' }}
        >
          Search your library… ⌘K
        </span>
      </div>

      <div className="flex">
        {/* sidebar */}
        <div className="amside hidden w-[92px] shrink-0 flex-col gap-1 border-r p-3 sm:flex" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
          {NAV.map((n, i) => (
            <span
              key={n}
              className="rounded-md px-2 py-1 text-[9px] font-medium"
              style={
                i === 1
                  ? { background: 'color-mix(in srgb, var(--primary) 16%, transparent)', color: 'var(--ink)' }
                  : { color: 'var(--muted)' }
              }
            >
              {n}
            </span>
          ))}
        </div>

        {/* main panel */}
        <div className="min-w-0 flex-1 p-4">
          <div className="text-[13px] leading-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--ink)' }}>
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
