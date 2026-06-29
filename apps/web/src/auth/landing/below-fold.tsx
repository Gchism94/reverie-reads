import { Link } from '@tanstack/react-router'
import { APP_NAME, SKINS, SKIN_LIST, type SkinId } from '@reverie/core'
import { Wordmark } from '../Wordmark'
import { SkinShowcase } from './SkinShowcase'

const display = { fontFamily: 'var(--font-display)', fontWeight: 600 } as const

/** Minimal stroke icons (token-coloured, no raster). */
function Icon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--eyebrow)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

// Copy matches the design, with the decided overrides applied (see comments).
const FEATURES = [
  { icon: 'M4 5h10a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2zM16 7h4v12h-4', title: 'Track & organize', body: 'A place for every shelf: your TBR, collections, rereads, and a reading calendar that keeps the whole year in view.' },
  { icon: 'M4 7v10M8 7v10M12 7v10M16 7v10M20 7v10', title: 'Scan & auto-complete', body: 'Point your camera at a barcode. Title, author, series, cover and metadata fill themselves in — no typing.' },
  { icon: 'M5 6h14M5 12h14M5 18h9', title: 'Series & reading orders', body: 'Tangled, interconnected series sorted into the exact order to read them — spin-offs, novellas and all.' },
  // OVERRIDE: Wrapped is PRIVATE (was "a shareable Wrapped … worth posting").
  { icon: 'M4 19V9m5 10V5m5 14v-7m5 7V8', title: 'Your year, as art', body: 'Beautiful stats and a private Wrapped — your reading year as art, for your eyes only.' },
  { icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 8l2 4-2 4-2-4z', title: 'Find your next read', body: 'A mood matchmaker that reads the room — time, energy, craving — and hands you exactly the right next book.' },
  // CONFIRMED real (store mode = no cut); dropped the absolute "and never will" (an affiliate mode is planned, with disclosure).
  { icon: 'M4 9h16l-1 11H5zM9 9V6a3 3 0 0 1 6 0v3', title: 'Buy indie', tag: 'We earn nothing', body: 'Every buy link points to Bookshop.org and Libro.fm, so your purchases support local bookstores — Reverie takes no cut.' },
]

const PRIVACY = [
  ['Export anytime', 'Your whole collection, downloadable in an open format whenever you want it. No lock-in.'],
  ['No ads, ever', 'No trackers, no sponsored shelves, no selling your taste to the highest bidder.'],
  // OVERRIDE: residency framing, no "yours alone"/never-public read and no "syncs only when you ask" (it syncs to your account).
  ['Your data, your device', 'Reverie runs in your browser and works offline — your library is yours to keep and export.'],
]

function Eyebrow({ children }: { children: string }) {
  return <p className="text-[12px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--eyebrow)' }}>{children}</p>
}

function SkinCard({ id }: { id: SkinId }) {
  const s = SKINS[id]
  return (
    <div data-skin={id} data-mode="dark" className="rounded-2xl border p-5 text-left" style={{ background: 'var(--card-solid)', borderColor: 'var(--line)' }}>
      {/* opaque --card-solid (not the translucent --card) so the skin's light text stays AA on the cream band */}
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>{s.genre}</div>
      <div className="mt-0.5 text-[21px]" style={{ ...display, color: 'var(--ink)' }}>{s.label}</div>
      <div className="mt-1 text-[12.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>{s.tagline}</div>
      <div className="mt-3 flex gap-1.5" aria-hidden>
        {['--primary', '--violet', '--gold', '--blue'].map((v) => (
          <span key={v} className="h-5 w-5 rounded-full border" style={{ background: `var(${v})`, borderColor: 'var(--line)' }} />
        ))}
      </div>
    </div>
  )
}

/** Everything below the hero — lazy-loaded so the hero paints first. */
export default function LandingBelowFold() {
  return (
    <>
      <SkinShowcase />

      {/* Features — light band */}
      <section id="features" className="band-light">
        <div className="mx-auto max-w-[1180px] px-6 py-20 sm:py-24">
          <div className="text-center">
            <Eyebrow>Features</Eyebrow>
            <h2 className="mx-auto mt-3 max-w-[20ch] text-balance text-[clamp(28px,4.5vw,42px)] leading-[1.06] text-ink" style={display}>
              Built for the way you actually read.
            </h2>
            <p className="mx-auto mt-4 max-w-[54ch] text-[15px] leading-relaxed text-muted">
              Everything that lives in spreadsheets and sticky notes, finally in one warm, organized home.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border p-6" style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
                <Icon d={f.icon} />
                {f.tag && (
                  <span className="mt-3 inline-block rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ background: 'color-mix(in srgb, var(--eyebrow) 16%, transparent)', color: 'var(--eyebrow)' }}>
                    {f.tag}
                  </span>
                )}
                <h3 className="mt-3 text-[17px] text-ink" style={display}>{f.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For every reader — light band; 4 REAL skins + adaptive (count aligned to what ships, not nine) */}
      <section id="readers" className="band-light">
        <div className="mx-auto max-w-[1180px] px-6 py-20 sm:py-24">
          <div className="text-center">
            <Eyebrow>For every reader</Eyebrow>
            <h2 className="mx-auto mt-3 max-w-[18ch] text-balance text-[clamp(28px,4.5vw,42px)] leading-[1.06] text-ink" style={display}>
              For every reader, not just one.
            </h2>
            <p className="mx-auto mt-4 max-w-[56ch] text-[15px] leading-relaxed text-muted">
              Romance or hard sci-fi, cozy mysteries or dense nonfiction — Reverie is built genre-first.
              Four skins today, from gothic romance to creeping horror, plus an adaptive one that learns yours.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SKIN_LIST.map((s) => (
              <SkinCard key={s.id} id={s.id} />
            ))}
            <div className="flex flex-col justify-center rounded-2xl border p-5 text-left" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
              <span aria-hidden className="h-9 w-9 rounded-full" style={{ background: 'conic-gradient(from 210deg, var(--eyebrow), var(--secondary, #7b3fa0), var(--eyebrow))' }} />
              <h3 className="mt-3 text-[18px] text-ink" style={display}>Adaptive</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Blended from your reading — your library’s own evolving skin.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy — dark */}
      <section id="privacy" className="mx-auto max-w-[1180px] px-6 py-20 sm:py-24">
        <div className="text-center">
          <Eyebrow>Yours, privately</Eyebrow>
          <h2 className="mx-auto mt-3 max-w-[18ch] text-balance text-[clamp(28px,4.5vw,42px)] leading-[1.06] text-ink" style={display}>
            Your library belongs to you.
          </h2>
          <p className="mx-auto mt-4 max-w-[52ch] text-[15px] leading-relaxed text-muted">
            Keep it for years, keep it ad-free, and never wonder who’s reading over your shoulder.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {PRIVACY.map(([k, v]) => (
            <div key={k} className="rounded-2xl border p-6" style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
              <h3 className="text-[16px] text-ink" style={display}>{k}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{v}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA — dark, centered */}
      <section id="get-started" className="relative mx-auto max-w-[1180px] px-6 py-24 text-center">
        <span aria-hidden className="mx-auto mb-5 block h-11 w-11 rounded-full" style={{ background: 'var(--gold)', boxShadow: '0 0 30px color-mix(in srgb, var(--gold) 55%, transparent)' }} />
        <h2 className="mx-auto max-w-[16ch] text-balance text-[clamp(30px,5vw,50px)] leading-[1.04] text-ink" style={display}>
          Start your library tonight.
        </h2>
        <p className="mx-auto mt-4 max-w-[48ch] text-[15px] leading-relaxed text-muted">
          It runs right in your browser, and installs as an app whenever you’re ready. Bring a barcode and a
          cup of something warm.
        </p>
        <div className="mt-7 flex justify-center">
          <Link
            to="/auth"
            search={{ mode: 'signup' }}
            className="flex h-12 items-center rounded-full px-8 text-[15px] font-semibold"
            style={{ background: 'var(--gold)', color: 'var(--on-primary)', boxShadow: '0 10px 26px color-mix(in srgb, var(--gold) 36%, transparent)' }}
          >
            Get started
          </Link>
        </div>
        {/* "Free to begin" removed — no pricing model to back. */}
        <p className="mt-4 text-[12.5px]" style={{ color: 'var(--faint)' }}>
          Runs in your browser · works offline · installs as a PWA
        </p>
      </section>

      <footer className="border-t" style={{ borderColor: 'var(--line)' }}>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-6 py-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-[34ch]">
            <Wordmark />
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              A reading life, beautifully kept — in a look that fits what you love.
            </p>
          </div>
          <nav aria-label="Landing sections" className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            {[
              ['The skins', '#skins'],
              ['Features', '#features'],
              ['For every reader', '#readers'],
              ['Privacy', '#privacy'],
            ].map(([label, href]) => (
              <a key={href} href={href} className="text-muted hover:text-ink">
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div className="border-t" style={{ borderColor: 'var(--line)' }}>
          <div className="mx-auto flex max-w-[1180px] flex-col gap-1 px-6 py-5 text-[12px] sm:flex-row sm:items-center sm:justify-between" style={{ color: 'var(--faint)' }}>
            <span>© {new Date().getFullYear()} {APP_NAME}. Made for readers.</span>
            <span>Buy links support indie bookstores · {APP_NAME} earns nothing.</span>
          </div>
        </div>
      </footer>
    </>
  )
}
