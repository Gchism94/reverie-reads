/** A lightweight, token-only app mockup for the landing — a browser-chrome frame around a tiny
 *  Reverie preview. It reads CSS vars exclusively (no hardcoded colours, no external images), so
 *  wrapping it in a `data-skin` / `data-mode` scope RE-THEMES it live — that's how the skin showcase
 *  shows the real skins. Cover tiles are var-based gradients so they re-theme too. Decorative. */
const NAV = ['Home', 'Library', 'Shelves', 'Planner', 'Stats'] as const

function Tile() {
  return (
    <div
      className="aspect-[2/3] flex-1 rounded-[5px] border"
      style={{
        borderColor: 'var(--line)',
        background: 'linear-gradient(150deg, color-mix(in srgb, var(--primary) 70%, var(--card)), color-mix(in srgb, var(--violet, var(--primary)) 60%, var(--card)))',
      }}
    />
  )
}

function Shelf({ label, n }: { label: string; n: number }) {
  return (
    <div>
      <div className="mb-1.5 text-[8px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: n }, (_, i) => (
          <Tile key={i} />
        ))}
      </div>
    </div>
  )
}

export function Mockup({ ariaLabel }: { ariaLabel?: string }) {
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
            <Shelf label="Currently reading" n={4} />
            <Shelf label="On your shelf" n={6} />
          </div>
        </div>
      </div>
    </div>
  )
}
