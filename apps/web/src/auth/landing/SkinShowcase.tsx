import { useState, type CSSProperties } from 'react'
import { SKINS, SKIN_LIST, type ResolvedMode, type SkinId } from '@reverie/core'
import { SkinAtmosphereCanvas } from '../../components/SkinAtmosphereCanvas'
import { AppRoomPreview } from '../../components/AppRoomPreview'
import { ProductStage } from './ProductStage'

const display = { fontFamily: 'var(--font-display)', fontWeight: 600 } as const

const ATMOSPHERE_NOTE: Record<SkinId, string> = {
  tryst: 'Still velvet light and gilt-paper grain',
  grimoire: 'Settled vellum and illuminated edges',
  aphelion: 'A quiet telemetry grid with no decorative scan',
  marrow: 'Edge fractures surface rarely, then recede',
  umbra: 'A near-imperceptible bank of office fog',
  folio: 'A steady proof page and editorial margin',
  hearth: 'Still linen, warm paper, and stitched edges',
  almanac: 'A stable field index built for reference',
  bloom: 'Dark-mode stars breathe without drifting',
}

/** Nine Reading Rooms makes skins legible as complete places. Every tile and the expanded stage
 * reads the real registry-driven token bundle: palette, type, radii, control silhouette, material,
 * and light/dark mode. The synthetic shelf is identical in every room so the skin is the variable. */
export function SkinShowcase() {
  const [active, setActive] = useState<SkinId>('tryst')
  const [mode, setMode] = useState<ResolvedMode>('dark')
  const skin = SKINS[active]

  return (
    <section id="skins" className="scroll-mt-20 border-y border-line py-20 sm:py-28">
      <div className="mx-auto max-w-[1180px] px-6">
        <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <div>
            <p
              className="text-[12px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: 'var(--eyebrow)' }}
            >
              Nine reading rooms
            </p>
            <h2
              className="mt-3 max-w-[13ch] text-balance text-[clamp(34px,5vw,56px)] leading-[1.01] text-ink"
              style={display}
            >
              The whole room changes with the shelf.
            </h2>
          </div>
          <p className="max-w-[58ch] text-[15px] leading-relaxed text-muted lg:justify-self-end">
            These are not color swatches. Each room changes the typography, materials, controls,
            spacing, cover treatment, and atmosphere of the same Reverie library. Pick one, then
            inspect the actual desktop and phone composition below.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Reverie reading rooms"
          className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {SKIN_LIST.map((room) => {
            const selected = room.id === active
            return (
              <button
                key={room.id}
                id={`room-tab-${room.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="active-reading-room"
                tabIndex={selected ? 0 : -1}
                data-skin={room.id}
                data-mode="dark"
                onClick={() => setActive(room.id)}
                onKeyDown={(event) => {
                  const currentIndex = SKIN_LIST.findIndex((candidate) => candidate.id === room.id)
                  let nextIndex: number | null = null
                  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                    nextIndex = (currentIndex + 1) % SKIN_LIST.length
                  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                    nextIndex = (currentIndex - 1 + SKIN_LIST.length) % SKIN_LIST.length
                  } else if (event.key === 'Home') {
                    nextIndex = 0
                  } else if (event.key === 'End') {
                    nextIndex = SKIN_LIST.length - 1
                  }

                  if (nextIndex === null) return
                  event.preventDefault()
                  const nextRoom = SKIN_LIST[nextIndex]!
                  setActive(nextRoom.id)
                  document.getElementById(`room-tab-${nextRoom.id}`)?.focus()
                }}
                className="group min-w-0 overflow-hidden border p-2.5 text-left transition-transform motion-reduce:transition-none sm:p-3"
                style={{
                  background: 'var(--bg0)',
                  borderColor: selected ? 'var(--primary)' : 'var(--line)',
                  borderRadius: 'var(--radius-panel)',
                  boxShadow: selected
                    ? '0 0 0 2px color-mix(in srgb, var(--primary) 45%, transparent), var(--shadow)'
                    : 'none',
                  transform: selected ? 'translateY(-2px)' : undefined,
                }}
              >
                <AppRoomPreview />
                <span className="mt-3 flex min-w-0 items-start justify-between gap-2 px-1 pb-0.5">
                  <span className="min-w-0">
                    <span
                      className="block break-words text-[18px] leading-[1.1] text-ink"
                      style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
                    >
                      {room.label}
                    </span>
                    <span className="mt-1.5 block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                      {room.genre}
                    </span>
                  </span>
                  <span className="skin-label mt-0.5 flex-none text-[11px] leading-[1.35] text-muted">
                    Enter →
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div
        id="active-reading-room"
        role="tabpanel"
        aria-labelledby={`room-tab-${active}`}
        data-testid="active-reading-room"
        data-active-skin={active}
        data-active-mode={mode}
        data-skin={active}
        data-mode={mode}
        className="relative mx-auto mt-10 max-w-[1380px] overflow-hidden border-y border-line px-4 py-12 text-left sm:px-8 sm:py-16 lg:px-14"
        style={
          {
            background: 'var(--bg0)',
            color: 'var(--ink)',
            '--stage-action-fill': 'var(--accent-fill)',
          } as CSSProperties
        }
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'var(--ambient-texture)',
            backgroundSize: 'var(--ambient-texture-size)',
            mixBlendMode: 'var(--ambient-texture-blend)' as CSSProperties['mixBlendMode'],
            opacity: 'var(--ambient-texture-opacity)',
            maskImage: 'var(--ambient-texture-mask)',
          }}
        />
        <SkinAtmosphereCanvas skin={active} mode={mode} />
        <div className="relative z-[1] mx-auto max-w-[1180px]">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p
                className="skin-label text-[11px] leading-[1.4]"
                style={{ color: 'var(--accent-ink)' }}
              >
                {skin.genre} · {skin.chromeLine}
              </p>
              <h3
                className="mt-2 text-[clamp(32px,5vw,54px)] leading-none text-ink"
                style={display}
              >
                The {skin.label} room
              </h3>
              <p className="mt-4 max-w-[52ch] text-[15px] leading-[1.65] text-muted">
                {skin.tagline} The books stay the same; the place they live becomes unmistakably its
                own.
              </p>
              <p className="mt-3 max-w-[52ch] text-[13.5px] leading-[1.6] text-muted">
                Atmosphere: {ATMOSPHERE_NOTE[active]}.
              </p>
            </div>
            <div
              role="group"
              aria-label="Room appearance"
              className="flex border border-line p-1"
              style={{ borderRadius: 'var(--radius-control)', background: 'var(--card)' }}
            >
              {(['dark', 'light'] as const).map((nextMode) => (
                <button
                  key={nextMode}
                  type="button"
                  onClick={() => setMode(nextMode)}
                  aria-pressed={mode === nextMode}
                  className={`skin-control min-h-11 px-4 text-[13px] font-semibold ${
                    mode === nextMode ? 'skin-btn-primary' : 'skin-btn-secondary'
                  }`}
                >
                  {nextMode === 'dark' ? 'Night' : 'Day'}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-9">
            <ProductStage compact />
          </div>

          <dl
            className="mt-9 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-3"
            style={{ borderRadius: 'var(--radius-panel)' }}
          >
            {[
              ['Display voice', skin.displayFont],
              ['Room signature', skin.chromeLine],
              ['Shelf language', `${skin.genre} · ${skin.labels.tags}`],
            ].map(([term, value]) => (
              <div key={term} className="min-w-0 bg-card p-4">
                <dt className="skin-label text-[11.5px] leading-[1.4] text-muted">{term}</dt>
                <dd className="mt-2 break-words text-[14px] leading-[1.4] text-ink" style={display}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mx-auto mt-6 flex max-w-[760px] items-center gap-4 px-6 text-left">
        <span
          aria-hidden
          className="h-11 w-11 flex-none rounded-full"
          style={{
            background:
              'conic-gradient(from 210deg, var(--gold), var(--violet), var(--primary), var(--gold))',
          }}
        />
        <p className="text-[14px] leading-[1.55] text-muted">
          Prefer not to choose? Adaptive quietly evolves from the same nine rooms as your reading
          changes, without changing the books or data underneath them.
        </p>
      </div>
    </section>
  )
}
