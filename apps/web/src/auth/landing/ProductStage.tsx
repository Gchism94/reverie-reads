import { useState } from 'react'

const display = { fontFamily: 'var(--font-display)', fontWeight: 600 } as const

interface DemoBook {
  id: string
  title: string
  author: string
  state: string
  owner?: string
}

const BOOKS: DemoBook[] = [
  {
    id: 'acotar',
    title: 'A Court of Thorns and Roses',
    author: 'Sarah J. Maas',
    state: 'Reading',
    owner: 'You',
  },
  {
    id: 'everflame',
    title: 'Spark of the Everflame',
    author: 'Penn Cole',
    state: 'Owned',
    owner: 'Mara',
  },
  {
    id: 'king-of-wrath',
    title: 'King of Wrath',
    author: 'Ana Huang',
    state: 'Read',
    owner: 'You · Mara',
  },
  {
    id: 'never-king',
    title: 'The Never King',
    author: 'Nikki St. Crowe',
    state: 'To get',
    owner: 'You',
  },
  {
    id: 'throne-of-glass',
    title: 'Throne of Glass',
    author: 'Sarah J. Maas',
    state: 'Owned',
    owner: 'Mara',
  },
  {
    id: 'mile-high',
    title: 'Mile High',
    author: 'Liz Tomforde',
    state: 'Read',
    owner: 'You',
  },
] as const

function Cover({
  book,
  eager = false,
  className = '',
}: {
  book: DemoBook
  eager?: boolean
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  return (
    <div
      className={`relative aspect-[2/3] min-w-0 overflow-hidden border border-line bg-field shadow-lg ${className}`}
      style={{ borderRadius: 'calc(var(--radius-card) * .72)' }}
    >
      {failed ? (
        <div
          className="flex h-full flex-col justify-end p-[10%]"
          style={{
            background:
              'linear-gradient(150deg, color-mix(in srgb, var(--primary) 68%, var(--card)), color-mix(in srgb, var(--violet, var(--primary)) 58%, var(--card)))',
          }}
        >
          <span className="text-[9px] italic leading-tight text-ink" style={display}>
            {book.title}
          </span>
        </div>
      ) : (
        <img
          src={`/landing-covers/${book.id}.jpg`}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : 'auto'}
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}

function BrowserBar() {
  return (
    <div className="flex h-8 items-center gap-2 border-b border-line bg-card px-3 sm:h-10">
      <span className="flex gap-1.5" aria-hidden>
        <span className="h-2 w-2 rounded-full bg-primary" />
        <span className="h-2 w-2 rounded-full bg-gold" />
        <span className="h-2 w-2 rounded-full bg-muted" />
      </span>
      <span className="mx-auto hidden w-[42%] rounded-full border border-line bg-field px-3 py-1 text-center text-[7px] text-muted sm:block">
        reverie · library
      </span>
    </div>
  )
}

function DesktopLibrary({ compact = false }: { compact?: boolean }) {
  return (
    <div
      data-testid="landing-desktop-screen"
      role="img"
      aria-label="A real-scale Reverie desktop library showing covers, filters, reading state, and personal or household scope"
      className="overflow-hidden border border-line bg-bg0"
      style={{ borderRadius: 'var(--radius-panel)', boxShadow: 'var(--shadow)' }}
    >
      <BrowserBar />
      <div
        aria-hidden
        className="grid min-h-[260px] grid-cols-1 sm:min-h-[430px] sm:grid-cols-[132px_1fr]"
      >
        <aside className="hidden border-r border-line bg-card p-4 sm:block">
          <div className="text-[15px] italic text-ink" style={display}>
            Reverie
          </div>
          <div className="mt-5 space-y-1 text-[9px] text-muted">
            {['Home', 'Library', 'Discover', 'Series', 'Planner', 'Stats'].map((item) => (
              <div
                key={item}
                className="px-2 py-1.5"
                style={
                  item === 'Library'
                    ? {
                        background: 'color-mix(in srgb, var(--primary) 16%, transparent)',
                        color: 'var(--ink)',
                        borderRadius: 'var(--radius-control)',
                      }
                    : undefined
                }
              >
                {item}
              </div>
            ))}
          </div>
          <div className="mt-6 border-t border-line pt-3 text-[8px] leading-relaxed text-muted">
            34 read this year
            <br />7 currently reading
          </div>
        </aside>

        <div className="min-w-0 p-3 sm:p-5 lg:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3 sm:pb-4">
            <div>
              <div className="skin-label text-[7px] text-muted sm:text-[9px]">
                34 books · 7 faves
              </div>
              <h2 className="mt-1 text-[20px] leading-none text-ink sm:text-[30px]" style={display}>
                Your library
              </h2>
              <p className="mt-2 hidden max-w-[50ch] text-[9px] leading-relaxed text-muted sm:block">
                Search, filter, and rediscover the books you’ve made part of your reading life.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[8px] font-semibold sm:text-[10px]">
              <div
                className="flex border border-line p-0.5"
                style={{ borderRadius: 'var(--radius-control)' }}
              >
                <span
                  className="px-2 py-1 text-on-primary"
                  style={{
                    background: 'var(--stage-action-fill, var(--primary))',
                    borderRadius: 'var(--radius-control)',
                  }}
                >
                  Personal
                </span>
                <span className="px-2 py-1 text-muted">Household</span>
              </div>
              <span className="hidden border border-line px-2.5 py-1.5 text-ink sm:inline">
                ＋ Add books
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-4">
            {['On your shelf', 'Unread', 'Fantasy', 'Sort: recent'].map((item, index) => (
              <span
                key={item}
                className="border border-line px-2 py-1 text-[7px] text-muted sm:text-[8px]"
                style={{
                  background: index === 0 ? 'var(--chip)' : 'transparent',
                  color: index === 0 ? 'var(--ink)' : 'var(--muted)',
                  borderRadius: 'var(--radius-control)',
                }}
              >
                {item}
              </span>
            ))}
          </div>

          <div
            className={`mt-4 grid grid-cols-4 gap-2.5 sm:grid-cols-6 sm:gap-3 ${compact ? 'lg:gap-3' : 'lg:gap-4'}`}
          >
            {BOOKS.map((book, index) => (
              <article key={book.id} className={index > 3 ? 'hidden sm:block' : ''}>
                <div className="relative">
                  <Cover book={book} eager={index < 2} />
                  <span
                    className="absolute bottom-1 right-1 px-1.5 py-0.5 text-[6px] font-semibold text-ink sm:text-[7px]"
                    style={{
                      background: 'var(--card-solid)',
                      borderRadius: 'var(--radius-control)',
                    }}
                  >
                    {book.state}
                  </span>
                </div>
                <h3 className="mt-1.5 line-clamp-2 text-[7px] font-semibold leading-tight text-ink sm:text-[9px]">
                  {book.title}
                </h3>
                <p className="mt-0.5 truncate text-[6px] text-muted sm:text-[8px]">{book.author}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function MobileBook() {
  const book = BOOKS[0]!
  return (
    <div
      data-testid="landing-mobile-screen"
      role="img"
      aria-label="A Reverie mobile book screen showing a cover, personal reading progress, formats, and series position"
      className="mx-auto w-full max-w-[218px] overflow-hidden border border-line bg-bg0 shadow-2xl"
      style={{ borderRadius: 'calc(var(--radius-panel) * 1.35)' }}
    >
      <div aria-hidden>
        <div className="flex h-8 items-center justify-between border-b border-line bg-card px-3 text-[7px] text-muted">
          <span>9:41</span>
          <span>Reverie</span>
          <span className="flex gap-0.5" aria-label="Connected">
            <span className="h-1 w-1 rounded-full bg-muted" />
            <span className="h-1 w-1 rounded-full bg-muted" />
            <span className="h-1 w-1 rounded-full bg-muted" />
          </span>
        </div>
        <div className="p-3.5">
          <div className="text-[8px] text-muted">← Library</div>
          <Cover book={book} eager className="mx-auto mt-3 w-[92px]" />
          <div className="mt-3 text-center">
            <div className="skin-label text-[7px] text-ink">Book record · The Court series #1</div>
            <h2
              className="mx-auto mt-1 max-w-[16ch] text-[17px] leading-[1.04] text-ink"
              style={display}
            >
              {book.title}
            </h2>
            <p className="mt-1 text-[9px] text-muted">{book.author}</p>
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-1">
            {['Owned', 'Physical', 'Fantasy'].map((item) => (
              <span
                key={item}
                className="bg-chip px-2 py-1 text-[7px] text-ink"
                style={{ borderRadius: 'var(--radius-control)' }}
              >
                {item}
              </span>
            ))}
          </div>
          <div
            className="mt-4 border border-line bg-card p-2.5"
            style={{ borderRadius: 'var(--radius-card)' }}
          >
            <div className="flex items-center justify-between text-[8px] text-ink">
              <span>Reading now</span>
              <span>62%</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-chip">
              <div className="h-full w-[62%] rounded-full bg-primary" />
            </div>
            <div className="mt-2 text-[7px] text-muted">Chapter eleven · started August 18</div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[8px] font-semibold">
            <span className="border border-line px-2 py-2 text-ink">Log progress</span>
            <span
              className="text-on-primary px-2 py-2"
              style={{ background: 'var(--stage-action-fill, var(--primary))' }}
            >
              Edit details
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The signed-out proof surface uses the same tokens, spacing, cover assets, and information
 * hierarchy as the shipped Library and book-detail routes. Its data is synthetic and local: the
 * public front door never reads an account merely to demonstrate the product. */
export function ProductStage({ compact = false }: { compact?: boolean }) {
  return (
    <div className="relative grid items-end gap-5 sm:grid-cols-[minmax(0,1fr)_190px] sm:gap-0">
      <div className="min-w-0 sm:pb-9 sm:pr-10">
        <DesktopLibrary compact={compact} />
      </div>
      <div className="relative z-[2] sm:-ml-16">
        <MobileBook />
      </div>
    </div>
  )
}

export function ReadingRecordStage() {
  const book = BOOKS[0]!
  return (
    <div
      role="img"
      aria-label="A full Reverie book record showing a cover, personal copies, reading progress, rereads, and trusted series context"
      className="overflow-hidden border border-line bg-bg0 shadow-2xl"
      style={{ borderRadius: 'var(--radius-panel)' }}
    >
      <BrowserBar />
      <div aria-hidden className="p-4 sm:p-6 lg:p-8">
        <div className="text-[9px] text-muted sm:text-[11px]">← Library</div>
        <div className="mt-4 grid gap-6 md:grid-cols-[190px_1fr] lg:grid-cols-[230px_1fr] lg:gap-9">
          <div>
            <Cover book={book} eager className="mx-auto w-full max-w-[190px] md:max-w-none" />
            <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[8px] font-semibold sm:text-[10px]">
              <span className="border border-line px-2 py-2 text-ink">♡ Favourite</span>
              <span className="border border-line px-2 py-2 text-ink">Edit details</span>
            </div>
          </div>

          <div className="min-w-0">
            <div className="skin-label text-[8px] text-ink sm:text-[10px]">
              Book record · The Court series #1
            </div>
            <h3
              className="mt-2 max-w-[17ch] text-[clamp(30px,5vw,52px)] leading-[0.98] text-ink"
              style={display}
            >
              {book.title}
            </h3>
            <p className="mt-3 text-[14px] text-muted sm:text-[17px]">{book.author}</p>

            <div className="mt-5 flex flex-wrap gap-2">
              {['Owned', 'Physical', 'Fantasy', 'High intensity'].map((item) => (
                <span
                  key={item}
                  className="border border-line bg-chip px-3 py-1.5 text-[8px] text-ink sm:text-[10px]"
                  style={{ borderRadius: 'var(--radius-control)' }}
                >
                  {item}
                </span>
              ))}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div
                className="border border-line bg-card p-4"
                style={{ borderRadius: 'var(--radius-card)' }}
              >
                <div className="skin-label text-[8px] text-muted">Reading now</div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <span className="text-[22px] text-ink" style={display}>
                    62%
                  </span>
                  <span className="text-[8px] text-muted">Chapter eleven</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-chip">
                  <div className="h-full w-[62%] rounded-full bg-primary" />
                </div>
              </div>
              <div
                className="border border-line bg-card p-4"
                style={{ borderRadius: 'var(--radius-card)' }}
              >
                <div className="skin-label text-[8px] text-muted">Your copies</div>
                <div className="mt-2 text-[13px] font-semibold text-ink">Hardcover · owned</div>
                <div className="mt-1 text-[9px] text-muted">Audiobook · borrowed</div>
                <div className="mt-3 text-[8px] text-muted">
                  Formats stay separate from reading history.
                </div>
              </div>
            </div>

            <div
              className="mt-3 border border-line bg-card p-4"
              style={{ borderRadius: 'var(--radius-card)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="skin-label text-[8px] text-muted">Reading history</div>
                  <div className="mt-1 text-[12px] font-semibold text-ink">
                    One active read · two rereads kept
                  </div>
                </div>
                <span className="text-[8px] text-muted">2023 · 2025 · now</span>
              </div>
              <div className="relative mt-4 grid grid-cols-3 gap-3 text-center text-[8px] text-muted">
                <span className="absolute left-[16%] right-[16%] top-2 h-px bg-line" />
                {['First read', 'Reread', 'Reading now'].map((item, index) => (
                  <div key={item} className="relative">
                    <span
                      className="relative z-[1] mx-auto block h-4 w-4 rounded-full border border-primary bg-bg0"
                      style={index === 2 ? { background: 'var(--primary)' } : undefined}
                    />
                    <span className="mt-2 block">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function HouseholdStage() {
  return (
    <div
      role="img"
      aria-label="A full Reverie household library screen showing one shared catalog while personal copies remain attributed to their readers"
      className="overflow-hidden border border-line bg-bg0 shadow-2xl"
      style={{ borderRadius: 'var(--radius-panel)' }}
    >
      <BrowserBar />
      <div aria-hidden className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
          <div>
            <div className="skin-label text-[8px] text-muted sm:text-[10px]">
              Household · shared
            </div>
            <h3 className="mt-1 text-[24px] leading-none text-ink sm:text-[34px]" style={display}>
              Household library
            </h3>
            <p className="mt-2 max-w-[58ch] text-[9px] leading-relaxed text-muted sm:text-[11px]">
              The books shared across your household, with every reader’s copy kept distinct.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[8px] font-semibold sm:text-[10px]">
            <span className="border border-line px-2.5 py-1.5 text-muted">Personal</span>
            <span
              className="px-2.5 py-1.5 text-on-primary"
              style={{ background: 'var(--stage-action-fill, var(--primary))' }}
            >
              Household
            </span>
            <span className="hidden border border-line px-2.5 py-1.5 text-ink sm:inline">
              ＋ Add books
            </span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-6 lg:gap-5">
          {BOOKS.map((book) => (
            <article key={book.id} className="min-w-0">
              <div className="relative">
                <Cover book={book} />
                <span
                  className="absolute left-1.5 top-1.5 max-w-[calc(100%-12px)] truncate px-2 py-1 text-[7px] font-semibold text-ink sm:text-[8px]"
                  style={{ background: 'var(--card-solid)', borderRadius: 'var(--radius-control)' }}
                >
                  {book.owner}
                </span>
                <span
                  className="absolute bottom-1.5 right-1.5 px-2 py-1 text-[7px] font-semibold text-ink sm:text-[8px]"
                  style={{ background: 'var(--card-solid)', borderRadius: 'var(--radius-control)' }}
                >
                  {book.state}
                </span>
              </div>
              <h4 className="mt-2 line-clamp-2 text-[10px] font-semibold leading-tight text-ink sm:text-[12px]">
                {book.title}
              </h4>
              <p className="mt-1 truncate text-[8px] text-muted sm:text-[10px]">{book.author}</p>
              <p className="mt-1 truncate text-[8px] font-semibold text-muted sm:text-[10px]">
                {book.owner}
              </p>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

const UNIVERSE_LANES = [
  { code: 'A', name: 'The Court', relation: 'Core series', books: [BOOKS[0]!, BOOKS[4]!] },
  { code: 'B', name: 'Emberfall', relation: 'Prequel series', books: [BOOKS[1]!, BOOKS[3]!] },
  {
    code: 'C',
    name: 'Crowned Hearts',
    relation: 'Companion series',
    books: [BOOKS[2]!, BOOKS[5]!],
  },
] as const

const UNIVERSE_ORDER = [
  { lane: 'A', position: 1, book: BOOKS[0]! },
  { lane: 'B', position: 1, book: BOOKS[1]! },
  { lane: 'A', position: 2, book: BOOKS[4]! },
  { lane: 'C', position: 1, book: BOOKS[2]! },
  { lane: 'B', position: 2, book: BOOKS[3]! },
  { lane: 'C', position: 2, book: BOOKS[5]! },
] as const

export function ConnectedStage() {
  return (
    <div
      role="img"
      aria-label="A Reverie Pro connected-universe screen where three separate series lanes join a central reviewed reading order"
      className="overflow-hidden border border-line bg-bg0 shadow-2xl"
      style={{ borderRadius: 'var(--radius-panel)' }}
    >
      <BrowserBar />
      <div aria-hidden className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <div className="skin-label text-[8px] text-muted sm:text-[10px]">
              Series universe · Pro
            </div>
            <h3 className="mt-1 text-[24px] leading-none text-ink sm:text-[34px]" style={display}>
              The Starlit Courts
            </h3>
            <p className="mt-2 max-w-[60ch] text-[9px] leading-relaxed text-muted sm:text-[11px]">
              Three distinct series, one reviewed universe order. Series positions remain their own.
            </p>
          </div>
          <span className="border border-line bg-chip px-3 py-1.5 text-[8px] font-semibold text-ink sm:text-[10px]">
            Publication order
          </span>
        </div>

        <div className="mt-6 hidden grid-cols-[minmax(0,1fr)_290px] gap-8 md:grid">
          <div className="space-y-4">
            {UNIVERSE_LANES.map((lane) => (
              <section
                key={lane.code}
                className="relative grid grid-cols-[112px_1fr_54px] items-center gap-4 border border-line bg-card p-3"
                style={{ borderRadius: 'var(--radius-card)' }}
              >
                <div>
                  <span className="inline-flex min-h-7 items-center border border-line bg-chip px-2.5 text-[8px] font-bold uppercase tracking-[0.14em] text-ink">
                    Series {lane.code}
                  </span>
                  <div className="mt-2 text-[11px] font-semibold text-ink">{lane.name}</div>
                  <div className="text-[8px] text-muted">{lane.relation}</div>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  {lane.books.map((book, index) => (
                    <div key={book.id} className="flex min-w-0 flex-1 items-center gap-2">
                      {index > 0 ? <span className="text-[11px] text-primary">→</span> : null}
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Cover book={book} className="w-[42px] flex-none" />
                        <div className="min-w-0">
                          <div className="line-clamp-2 text-[8px] font-semibold leading-tight text-ink">
                            {book.title}
                          </div>
                          <div className="mt-1 text-[7px] text-muted">#{index + 1}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="relative h-full min-h-16">
                  <span className="absolute left-0 right-[-33px] top-1/2 h-px bg-primary" />
                  <span className="absolute right-0 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-primary bg-bg0 text-[8px] font-bold text-primary">
                    {lane.code}
                  </span>
                </div>
              </section>
            ))}
          </div>

          <section className="relative border-l border-primary pl-7">
            <div className="skin-label text-[8px] text-muted">Central timeline</div>
            <div className="mt-1 text-[13px] font-semibold text-ink">Reviewed universe order</div>
            <ol className="mt-4 space-y-2.5">
              {UNIVERSE_ORDER.map((entry, index) => (
                <li
                  key={`${entry.lane}-${entry.position}`}
                  className="relative grid grid-cols-[24px_1fr] items-center gap-2"
                >
                  <span className="absolute -left-[34px] h-3 w-3 rounded-full border border-primary bg-bg0" />
                  <span
                    className="grid h-6 w-6 place-items-center rounded-full text-[7px] font-bold text-on-primary"
                    style={{ background: 'var(--stage-action-fill, var(--primary))' }}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[8px] font-semibold text-ink">
                      {entry.book.title}
                    </div>
                    <div className="text-[7px] text-muted">
                      Series {entry.lane} · #{entry.position}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <ol className="mt-5 space-y-3 md:hidden">
          {UNIVERSE_ORDER.map((entry, index) => (
            <li
              key={`${entry.lane}-${entry.position}`}
              className="grid grid-cols-[36px_1fr] gap-3 border-b border-line pb-3"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full border border-primary text-[10px] font-bold text-primary">
                {index + 1}
              </span>
              <div>
                <div className="text-[10px] font-semibold text-ink">{entry.book.title}</div>
                <div className="mt-1 text-[8px] text-muted">
                  Series {entry.lane} · position {entry.position}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

export function RoomThumbnail() {
  return (
    <div
      aria-hidden
      className="overflow-hidden border border-line bg-bg0"
      style={{ borderRadius: 'var(--radius-card)' }}
    >
      <div className="flex h-5 items-center gap-1 border-b border-line bg-card px-2">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="h-1.5 w-1.5 rounded-full bg-gold" />
        <span className="ml-auto text-[5px] text-muted">Library</span>
      </div>
      <div className="grid grid-cols-[28px_1fr]">
        <div className="border-r border-line bg-card p-1.5">
          <div className="h-1.5 w-4 bg-primary" />
          <div className="mt-2 space-y-1">
            <div className="h-1 w-4 bg-muted opacity-40" />
            <div className="h-1 w-4 bg-muted opacity-40" />
            <div className="h-1 w-4 bg-muted opacity-40" />
          </div>
        </div>
        <div className="p-2">
          <div className="text-[7px] text-ink" style={display}>
            Your library
          </div>
          <div className="mt-2 flex gap-1">
            {BOOKS.slice(0, 4).map((book) => (
              <Cover key={book.id} book={book} className="w-[24px] flex-none" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
