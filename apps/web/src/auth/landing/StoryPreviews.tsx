const display = { fontFamily: 'var(--font-display)', fontWeight: 600 } as const

const coverGradients = [
  'linear-gradient(145deg, color-mix(in srgb, var(--gold) 72%, var(--bg0)), color-mix(in srgb, var(--violet) 70%, var(--bg1)))',
  'linear-gradient(160deg, color-mix(in srgb, var(--blue) 76%, var(--bg0)), color-mix(in srgb, var(--primary) 58%, var(--bg1)))',
  'linear-gradient(135deg, color-mix(in srgb, var(--primary) 62%, var(--bg0)), color-mix(in srgb, var(--gold) 38%, var(--bg1)))',
  'linear-gradient(155deg, color-mix(in srgb, var(--violet) 72%, var(--bg0)), color-mix(in srgb, var(--blue) 72%, var(--bg1)))',
] as const

function FixtureCover({
  title,
  author,
  index,
  className = '',
}: {
  title: string
  author: string
  index: number
  className?: string
}) {
  return (
    <div
      className={`relative flex aspect-[2/3] min-w-0 flex-col justify-between overflow-hidden border p-2 shadow-lg ${className}`}
      style={{
        background: coverGradients[index % coverGradients.length],
        borderColor: 'color-mix(in srgb, var(--gold) 45%, var(--line))',
        borderRadius: 'var(--radius-card)',
      }}
    >
      <span
        className="h-px w-5"
        style={{ background: 'color-mix(in srgb, var(--ink) 62%, transparent)' }}
      />
      <span
        className="text-balance text-[clamp(9px,1.4vw,13px)] leading-[1.05]"
        style={{ ...display, color: 'var(--ink)' }}
      >
        {title}
      </span>
      <span className="text-[7px] uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>
        {author}
      </span>
    </div>
  )
}

function PreviewShell({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="relative overflow-hidden border p-3 shadow-2xl sm:p-4"
      style={{
        background: 'color-mix(in srgb, var(--bg1) 92%, transparent)',
        borderColor: 'color-mix(in srgb, var(--gold) 34%, var(--line))',
        borderRadius: 'var(--radius-card)',
        boxShadow: '0 28px 70px color-mix(in srgb, var(--bg0) 70%, transparent)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full blur-3xl"
        style={{ background: 'color-mix(in srgb, var(--gold) 18%, transparent)' }}
      />
      {children}
    </div>
  )
}

export function PersonalLibraryPreview() {
  const books = [
    ['The Glass Orchard', 'Mira Vale'],
    ['A Map of Quiet Stars', 'Inez North'],
    ['Salt & Ember', 'June Marrow'],
    ['The Winter Archive', 'E. L. Quill'],
  ] as const

  return (
    <PreviewShell label="Curated preview of a personal Reverie library with four books and reading context">
      <div aria-hidden>
        <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
          <div>
            <div className="skin-label text-[8px] text-muted">Your books</div>
            <div className="mt-0.5 text-[20px] text-ink" style={display}>
              Your library
            </div>
          </div>
          <div
            className="flex border border-line p-0.5"
            style={{ borderRadius: 'var(--radius-control)' }}
          >
            <span
              className="px-2.5 py-1 text-[8px] font-semibold"
              style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
            >
              Personal
            </span>
            <span className="px-2.5 py-1 text-[8px] text-muted">Household</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_108px] gap-3 sm:grid-cols-[minmax(0,1fr)_132px]">
          <div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {['Unread', 'Gothic', 'On a shelf'].map((label, index) => (
                <span
                  key={label}
                  className="border px-2 py-1 text-[7px] uppercase tracking-[0.08em]"
                  style={{
                    borderColor: 'var(--line)',
                    color: index === 0 ? 'var(--ink)' : 'var(--muted)',
                    background:
                      index === 0
                        ? 'color-mix(in srgb, var(--primary) 16%, transparent)'
                        : 'transparent',
                    borderRadius: 'var(--radius-control)',
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {books.map(([title, author], index) => (
                <FixtureCover key={title} title={title} author={author} index={index} />
              ))}
            </div>
          </div>

          <div
            className="border p-2.5"
            style={{
              background: 'var(--card)',
              borderColor: 'var(--line)',
              borderRadius: 'var(--radius-card)',
            }}
          >
            <div className="skin-label text-[7px] text-muted">Reading now</div>
            <FixtureCover
              title="The Glass Orchard"
              author="Mira Vale"
              index={0}
              className="mx-auto mt-2 w-[58px] sm:w-[70px]"
            />
            <div className="mt-2 text-center text-[8px] font-semibold text-ink">Chapter eleven</div>
            <div
              className="mt-2 h-1 overflow-hidden rounded-full"
              style={{ background: 'var(--chip)' }}
            >
              <div className="h-full w-[62%] rounded-full" style={{ background: 'var(--gold)' }} />
            </div>
            <div className="mt-1 text-right text-[7px] text-muted">62%</div>
          </div>
        </div>
      </div>
    </PreviewShell>
  )
}

export function HouseholdPreview() {
  const rows = [
    { title: 'A Map of Quiet Stars', author: 'Inez North', owner: 'You', index: 1 },
    { title: 'The Winter Archive', author: 'E. L. Quill', owner: 'Mara', index: 3 },
    { title: 'Salt & Ember', author: 'June Marrow', owner: 'You · Mara', index: 2 },
  ]

  return (
    <PreviewShell label="Curated preview of a household catalog where two readers keep distinct copies">
      <div aria-hidden>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
          <div>
            <div className="skin-label text-[8px] text-muted">Household · shared</div>
            <div className="mt-0.5 text-[20px] text-ink" style={display}>
              The Lantern household
            </div>
            <div className="mt-1 text-[8px] text-muted">2 readers · one shared entry per work</div>
          </div>
          <div className="flex gap-1.5">
            <span className="border border-line px-2 py-1 text-[8px] text-ink">You</span>
            <span className="border border-line px-2 py-1 text-[8px] text-muted">Mara</span>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.title}
              className="grid grid-cols-[42px_1fr] gap-2 border p-2"
              style={{
                background: 'var(--card)',
                borderColor: 'var(--line)',
                borderRadius: 'var(--radius-card)',
              }}
            >
              <FixtureCover title={row.title} author={row.author} index={row.index} />
              <div className="min-w-0 self-center">
                <div className="text-[9px] font-semibold leading-tight text-ink">{row.title}</div>
                <div className="mt-1 text-[7px] text-muted">{row.author}</div>
                <div
                  className="mt-2 inline-flex px-1.5 py-0.5 text-[7px] font-semibold"
                  style={{
                    background: 'var(--chip)',
                    color: 'var(--ink)',
                    borderRadius: 'var(--radius-control)',
                  }}
                >
                  {row.owner}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div
          className="mt-3 flex items-center justify-between gap-3 border px-3 py-2 text-[8px]"
          style={{
            borderColor: 'var(--line)',
            background: 'color-mix(in srgb, var(--gold) 8%, transparent)',
          }}
        >
          <span className="font-semibold text-ink">Same shelf, separate reading lives.</span>
          <span className="text-right text-muted">Ownership · progress · notes stay personal</span>
        </div>
      </div>
    </PreviewShell>
  )
}

export function SeriesPreview() {
  const entries = [
    { position: '1', title: 'Winter Seed', state: 'Read', index: 3 },
    { position: '2', title: 'The Glass Orchard', state: 'Reading', index: 0 },
    { position: '2.5', title: 'Branches at Dusk', state: 'To get', index: 1 },
    { position: '3', title: 'Orchard of Ash', state: 'Owned', index: 2 },
  ]

  return (
    <PreviewShell label="Curated preview of a confirmed series order with progress and one missing book">
      <div aria-hidden>
        <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
          <div>
            <div className="skin-label text-[8px] text-muted">Series</div>
            <div className="mt-0.5 text-[22px] text-ink" style={display}>
              The Glass Orchard
            </div>
            <div className="mt-1 text-[8px] text-muted">2 read · 1 to get · confirmed order</div>
          </div>
          <span
            className="border px-2 py-1 text-[7px] uppercase tracking-[0.08em]"
            style={{ borderColor: 'var(--line)', color: 'var(--gold)' }}
          >
            Primary series
          </span>
        </div>
        <div className="relative mt-4 grid grid-cols-4 gap-2 sm:gap-3">
          <div
            className="absolute left-[10%] right-[10%] top-4 h-px"
            style={{ background: 'color-mix(in srgb, var(--gold) 60%, var(--line))' }}
          />
          {entries.map((entry, index) => (
            <div key={entry.position} className="relative min-w-0 text-center">
              <div
                className="relative z-[1] mx-auto grid h-8 w-8 place-items-center rounded-full border text-[8px] font-bold"
                style={{
                  background: index === 2 ? 'var(--bg1)' : 'var(--gold)',
                  color: index === 2 ? 'var(--gold)' : 'var(--on-primary)',
                  borderColor: 'var(--gold)',
                }}
              >
                {entry.position}
              </div>
              {index === 2 ? (
                <div
                  className="mx-auto mt-2 flex aspect-[2/3] max-w-[76px] items-center justify-center border border-dashed px-2 text-[8px] text-muted"
                  style={{ borderColor: 'var(--gold)', borderRadius: 'var(--radius-card)' }}
                >
                  Missing book
                </div>
              ) : (
                <FixtureCover
                  title={entry.title}
                  author="Mira Vale"
                  index={entry.index}
                  className="mx-auto mt-2 max-w-[76px]"
                />
              )}
              <div className="mt-2 truncate text-[8px] font-semibold text-ink">{entry.title}</div>
              <div className="mt-0.5 text-[7px] text-muted">{entry.state}</div>
            </div>
          ))}
        </div>
      </div>
    </PreviewShell>
  )
}

export function MatchPreview() {
  return (
    <PreviewShell label="Curated preview of Reverie matching an unread library book to a reader's mood">
      <div aria-hidden className="grid gap-3 sm:grid-cols-[1fr_0.88fr]">
        <div className="border-b border-line pb-3 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3">
          <div className="skin-label text-[8px] text-muted">Match</div>
          <div className="mt-1 max-w-[13ch] text-[23px] leading-[1.03] text-ink" style={display}>
            What kind of book fits tonight?
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {['Atmospheric', 'Thought-provoking', 'A little strange'].map((label, index) => (
              <span
                key={label}
                className="border px-2.5 py-1.5 text-[8px]"
                style={{
                  borderColor: index === 1 ? 'var(--gold)' : 'var(--line)',
                  color: index === 1 ? 'var(--ink)' : 'var(--muted)',
                  background:
                    index === 1
                      ? 'color-mix(in srgb, var(--gold) 12%, transparent)'
                      : 'transparent',
                  borderRadius: 'var(--radius-control)',
                }}
              >
                {label}
              </span>
            ))}
          </div>
          <div className="mt-3 text-[8px] leading-relaxed text-muted">
            Reverie ranks unread books already in your library against the mood you choose.
          </div>
        </div>
        <div className="grid grid-cols-[72px_1fr] items-center gap-3">
          <FixtureCover title="A Map of Quiet Stars" author="Inez North" index={1} />
          <div>
            <div className="skin-label text-[7px]" style={{ color: 'var(--gold)' }}>
              Closest match
            </div>
            <div className="mt-1 text-[13px] text-ink" style={display}>
              A Map of Quiet Stars
            </div>
            <div className="mt-1 text-[8px] text-muted">Inez North</div>
            <div className="mt-3 flex flex-wrap gap-1">
              {['Atmospheric', 'Slow burn', 'On your shelf'].map((reason) => (
                <span key={reason} className="bg-chip px-1.5 py-1 text-[7px] text-ink">
                  {reason}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PreviewShell>
  )
}
import type { ReactNode } from 'react'
