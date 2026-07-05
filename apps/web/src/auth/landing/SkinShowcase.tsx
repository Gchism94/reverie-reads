import { useState } from 'react'
import { SKINS, SKIN_LIST, type SkinId } from '@reverie/core'
import { Mockup } from './Mockup'

/** "Reverie speaks your genre" — the differentiator. A row of skin tabs re-themes a single live app
 *  mockup IN PLACE by scoping it to that skin's real `data-skin` tokens (no faked screenshots, no
 *  hardcoded palette). Default Tryst. The Tryst pink lives here, in its own skin card — never on the
 *  landing's gold brand. Plus the real Adaptive (Tier-2) skin. */
export function SkinShowcase() {
  const [active, setActive] = useState<SkinId>('tryst')
  const skin = SKINS[active]

  return (
    <section id="skins" className="relative mx-auto max-w-[1180px] px-6 py-20 text-center sm:py-28">
      <p className="text-[12px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--eyebrow)' }}>
        The differentiator
      </p>
      <h2 className="mx-auto mt-3 max-w-[18ch] text-balance text-[clamp(30px,5vw,46px)] leading-[1.05] text-ink" style={display}>
        Reverie speaks your genre.
      </h2>
      <p className="mx-auto mt-4 max-w-[58ch] text-[15px] leading-relaxed text-muted">
        One library, many moods. Choose a skin and your whole collection — shelves, type, the night sky
        itself — shifts to match the world you’re reading in.
      </p>

      {/* tabs — each themed by its own real skin tokens */}
      <div role="tablist" aria-label="Skins" className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
        {SKIN_LIST.map((s) => {
          const on = s.id === active
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={on}
              data-skin={s.id}
              data-mode="dark"
              onClick={() => setActive(s.id)}
              className="flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors motion-reduce:transition-none"
              style={
                on
                  ? { background: 'var(--accent-fill)', color: 'var(--on-primary)', boxShadow: '0 8px 22px color-mix(in srgb, var(--accent-fill) 40%, transparent)' }
                  : { color: 'var(--ink)', border: '1px solid var(--line)' }
              }
            >
              <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--primary)' }} />
              {s.label}
              <span className="text-[10px] font-medium uppercase tracking-[0.14em]" style={{ opacity: 0.7 }}>
                {s.genre}
              </span>
            </button>
          )
        })}
      </div>

      {/* live mockup, re-themed in place */}
      <div data-skin={active} data-mode="dark" className="mx-auto mt-8 max-w-[680px] text-left transition-colors motion-reduce:transition-none">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <span className="text-[15px]" style={{ ...display, color: 'var(--ink)' }}>
            {skin.label} <span className="text-[12px] font-normal uppercase tracking-[0.14em]" style={{ color: 'var(--muted)' }}>· {skin.genre}</span>
          </span>
          <span className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
            {skin.tagline}
          </span>
        </div>
        <Mockup ariaLabel={`Reverie in the ${skin.label} skin`} />
      </div>

      {/* adaptive */}
      <div className="mx-auto mt-7 flex max-w-[680px] items-center gap-4 rounded-2xl border p-5 text-left" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
        <span
          aria-hidden
          className="h-12 w-12 shrink-0 rounded-full"
          style={{ background: 'conic-gradient(from 210deg, var(--gold), var(--violet), var(--primary), var(--gold))' }}
        />
        <div>
          <h3 className="text-[16px] text-ink" style={display}>
            Or don’t choose — meet the Adaptive skin
          </h3>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
            It reads what you read and lets your library quietly evolve with your taste, season by season.
          </p>
        </div>
      </div>
    </section>
  )
}

const display = { fontFamily: 'var(--font-display)', fontWeight: 600 } as const
