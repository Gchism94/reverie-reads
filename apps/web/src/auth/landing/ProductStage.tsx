import { useState } from 'react'
import { APP_NAME } from '@reverie/core'
import { NavigationGlyph } from '../../components/NavigationGlyph'
import { MOBILE_TAB_ITEMS, NAVIGATION_GROUPS } from '../../components/navigation'

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
          <span className="text-[10.5px] italic leading-[1.25] text-ink" style={display}>
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
    <div className="flex h-8 items-center justify-between border-b border-line bg-card px-3 sm:h-10">
      <span className="skin-label text-[10px] text-muted sm:text-[10.5px]">Sample library</span>
      <span className="hidden border-b border-line px-6 py-1 text-center text-[10.5px] text-muted sm:block">
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
        className="grid min-h-[290px] grid-cols-1 sm:min-h-[500px] sm:grid-cols-[184px_1fr]"
      >
        <aside className="rv-nav-surface rv-preview-sidebar hidden p-3 sm:flex sm:flex-col">
          <div className="rv-chrome rv-nav-brand flex items-center gap-2 px-0.5 pb-2.5">
            <span
              className="rv-nav-monogram grid h-8 w-8 shrink-0 place-items-center text-[14px] italic"
              style={display}
            >
              {APP_NAME.charAt(0)}
            </span>
            <span className="min-w-0">
              <span
                className="rv-nav-wordmark block text-[14px] leading-none text-ink"
                style={display}
              >
                {APP_NAME}
              </span>
              <span className="skin-label mt-1 block truncate text-[10px] leading-[1.35] text-muted">
                Your living library
              </span>
            </span>
          </div>
          <span className="skin-control skin-btn-primary mt-2.5 flex min-h-9 items-center justify-center gap-1.5 px-2 text-[11.5px]">
            <span aria-hidden>＋</span> Add a book
          </span>
          <nav
            className="rv-primary-nav mt-3 flex flex-col gap-2.5"
            aria-label="Preview navigation"
          >
            {NAVIGATION_GROUPS.map((group) => (
              <div key={group.label} className="rv-nav-group flex flex-col gap-0.5">
                <div className="rv-nav-group-label skin-label px-2 text-[10px] leading-[1.35] text-muted">
                  {group.label}
                </div>
                {group.items.map((item) => (
                  <span
                    key={item.to}
                    className={`rv-nav-item flex min-h-8 items-center gap-2 px-2 py-1 text-[12px] font-medium ${
                      item.to === '/library' ? 'rv-nav-item-active' : ''
                    }`}
                    style={{ color: item.to === '/library' ? 'var(--ink)' : 'var(--muted)' }}
                  >
                    <span className="rv-nav-glyph grid w-4 place-items-center">
                      <NavigationGlyph name={item.icon} className="h-[14px] w-[14px]" />
                    </span>
                    {item.label}
                  </span>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 p-3 sm:p-5 lg:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3 sm:pb-4">
            <div>
              <div className="skin-label text-[11px] text-muted sm:text-[12px]">
                34 books · 7 faves
              </div>
              <h2 className="mt-1 text-[20px] leading-none text-ink sm:text-[30px]" style={display}>
                Your library
              </h2>
              <p className="mt-2 hidden max-w-[50ch] text-[12.5px] leading-[1.55] text-muted sm:block">
                Search, filter, and rediscover the books you’ve made part of your reading life.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10.5px] font-semibold sm:text-[11.5px]">
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
              <span className="skin-control skin-btn-secondary hidden px-2.5 py-1.5 text-ink sm:inline">
                ＋ Add books
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-4">
            {['On your shelf', 'Unread', 'Fantasy', 'Sort: recent'].map((item, index) => (
              <span
                key={item}
                className="border border-line px-2 py-1 text-[10.5px] text-muted sm:text-[11px]"
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
            className={`mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6 sm:gap-3 ${compact ? 'lg:gap-3' : 'lg:gap-4'}`}
          >
            {BOOKS.map((book, index) => (
              <article key={book.id} className={index > 2 ? 'hidden sm:block' : ''}>
                <div className="relative">
                  <Cover book={book} eager={index < 2} />
                  <span
                    className="absolute bottom-1 right-1 px-1.5 py-0.5 text-[9.5px] font-semibold text-ink sm:text-[10px]"
                    style={{
                      background: 'var(--card-solid)',
                      borderRadius: 'var(--radius-control)',
                    }}
                  >
                    {book.state}
                  </span>
                </div>
                <h3 className="mt-1.5 line-clamp-2 text-[10.5px] font-semibold leading-[1.35] text-ink sm:text-[11.5px]">
                  {book.title}
                </h3>
                <p className="mt-1 truncate text-[10px] leading-[1.4] text-muted sm:text-[10.5px]">
                  {book.author}
                </p>
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
      className="relative mx-auto w-full max-w-[276px] overflow-hidden border border-line bg-bg0 shadow-2xl"
      style={{ borderRadius: 'calc(var(--radius-panel) * 1.35)' }}
    >
      <div aria-hidden>
        <div className="rv-mobile-header rv-preview-mobile-header flex min-h-11 items-center justify-between px-3">
          <span className="rv-mobile-wordmark text-[16px] italic text-ink" style={display}>
            Reverie
          </span>
          <span className="skin-label text-[10px] text-muted">Library</span>
        </div>
        <div className="px-4 pb-[68px] pt-3.5">
          <div className="text-[11.5px] text-muted">← Library</div>
          <Cover book={book} eager className="mx-auto mt-3 w-[92px]" />
          <div className="mt-3 text-center">
            <div className="skin-label text-[10px] leading-[1.4] text-ink">
              Book record · The Court series #1
            </div>
            <h2
              className="mx-auto mt-1.5 max-w-[16ch] text-[19px] leading-[1.08] text-ink"
              style={display}
            >
              {book.title}
            </h2>
            <p className="mt-1.5 text-[12px] leading-[1.45] text-muted">{book.author}</p>
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-1">
            {['Owned', 'Physical', 'Fantasy'].map((item) => (
              <span
                key={item}
                className="bg-chip px-2 py-1 text-[10.5px] text-ink"
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
            <div className="flex items-center justify-between text-[11.5px] text-ink">
              <span>Reading now</span>
              <span>62%</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-chip">
              <div className="h-full w-[62%] rounded-full bg-primary" />
            </div>
            <div className="mt-2 text-[10.5px] leading-[1.45] text-muted">
              Chapter eleven · started August 18
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[11.5px] font-semibold">
            <span className="skin-control skin-btn-secondary px-2 py-2 text-ink">Log progress</span>
            <span className="skin-control skin-btn-primary px-2 py-2">Edit details</span>
          </div>
        </div>
        <div className="rv-mobile-dock rv-preview-mobile-dock absolute inset-x-0 bottom-0">
          <div className="rv-mobile-dock-grid grid grid-cols-5">
            {MOBILE_TAB_ITEMS.slice(0, 2).map((item) => (
              <span
                key={item.to}
                className={`rv-mobile-tab flex min-h-[54px] flex-col items-center justify-center gap-1 text-[10.5px] ${
                  item.to === '/library' ? 'rv-mobile-tab-active' : ''
                }`}
              >
                <NavigationGlyph name={item.icon} className="h-4 w-4" />
                <span className="skin-label">{item.label}</span>
              </span>
            ))}
            <span className="flex items-start justify-center">
              <span className="rv-mobile-add skin-control skin-btn-primary grid h-11 w-11 -translate-y-2 place-items-center text-[16px]">
                ＋
              </span>
            </span>
            <span className="rv-mobile-tab flex min-h-[54px] flex-col items-center justify-center gap-1 text-[10.5px]">
              <NavigationGlyph name={MOBILE_TAB_ITEMS[2].icon} className="h-4 w-4" />
              <span className="skin-label">{MOBILE_TAB_ITEMS[2].label}</span>
            </span>
            <span className="rv-mobile-tab flex min-h-[54px] flex-col items-center justify-center gap-1 text-[10.5px]">
              <span className="text-[15px] leading-none">···</span>
              <span className="skin-label">More</span>
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
    <div className="relative grid items-end gap-5 sm:grid-cols-[minmax(0,1fr)_244px] sm:gap-0">
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
        <div className="text-[11.5px] text-muted sm:text-[12.5px]">← Library</div>
        <div className="mt-4 grid gap-6 md:grid-cols-[190px_1fr] lg:grid-cols-[230px_1fr] lg:gap-9">
          <div>
            <Cover book={book} eager className="mx-auto w-full max-w-[190px] md:max-w-none" />
            <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[10.5px] font-semibold sm:text-[11.5px]">
              <span className="skin-control skin-btn-secondary px-2 py-2">♡ Favourite</span>
              <span className="skin-control skin-btn-primary px-2 py-2">Edit details</span>
            </div>
          </div>

          <div className="min-w-0">
            <div className="skin-label text-[10px] text-ink sm:text-[11.5px]">
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
                  className="border border-line bg-chip px-3 py-1.5 text-[10.5px] text-ink sm:text-[11.5px]"
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
                <div className="skin-label text-[10.5px] text-muted">Reading now</div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <span className="text-[22px] text-ink" style={display}>
                    62%
                  </span>
                  <span className="text-[10.5px] text-muted">Chapter eleven</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-chip">
                  <div className="h-full w-[62%] rounded-full bg-primary" />
                </div>
              </div>
              <div
                className="border border-line bg-card p-4"
                style={{ borderRadius: 'var(--radius-card)' }}
              >
                <div className="skin-label text-[10.5px] text-muted">Your copies</div>
                <div className="mt-2 text-[13px] font-semibold text-ink">Hardcover · owned</div>
                <div className="mt-1 text-[11px] text-muted">Audiobook · borrowed</div>
                <div className="mt-3 text-[10.5px] leading-[1.45] text-muted">
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
                  <div className="skin-label text-[10.5px] text-muted">Reading history</div>
                  <div className="mt-1 text-[12.5px] font-semibold text-ink">
                    One active read · two rereads kept
                  </div>
                </div>
                <span className="text-[10.5px] text-muted">2023 · 2025 · now</span>
              </div>
              <div className="relative mt-4 grid grid-cols-3 gap-3 text-center text-[10.5px] text-muted">
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
