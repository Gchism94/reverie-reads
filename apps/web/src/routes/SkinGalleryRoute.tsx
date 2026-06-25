import { createRoute } from '@tanstack/react-router'
import { SKIN_LIST, type Mode, type ResolvedMode, type Skin } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { useSkin } from '../skin/useSkin'
import { useSkinControls } from '../skin/controls'
import { SkinDivider } from '../components/SkinDivider'

const SWATCHES = ['--bg', '--card', '--primary', '--accent-fill', '--gold'] as const

function SkinCard({
  skin,
  mode,
  active,
  onSelect,
}: {
  skin: Skin
  mode: ResolvedMode
  active: boolean
  onSelect: () => void
}) {
  // The wrapper carries the skin's data attributes, so every var() inside resolves to THIS skin
  // (and the chosen preview mode) — a true live preview independent of the active app skin.
  return (
    <div
      data-skin={skin.id}
      data-mode={mode}
      className="overflow-hidden rounded-2xl border"
      style={{ background: 'var(--bg)', borderColor: active ? 'var(--primary)' : 'var(--line)' }}
    >
      <div className="p-4">
        <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
          {skin.genre}
        </div>
        <div className="mt-0.5 text-[22px] leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)', fontWeight: 600 }}>
          {skin.label}
        </div>
        <div className="mt-1 text-[13px]" style={{ color: 'var(--muted)' }}>
          {skin.tagline}
        </div>

        <div className="mt-3 flex gap-1.5">
          {SWATCHES.map((v) => (
            <span key={v} className="h-5 w-5 rounded-full border" style={{ background: `var(${v})`, borderColor: 'var(--chip-border)' }} />
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="rounded-full border px-3 py-1 text-[12px] font-medium"
            style={{ background: 'var(--chip)', color: 'var(--ink)', borderColor: 'var(--chip-border)' }}
          >
            Sample tag
          </span>
          <span className="rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: 'var(--accent-fill)', color: 'var(--on-primary)' }}>
            Primary
          </span>
          <span className="text-[12px]" style={{ color: 'var(--primary)' }}>
            A link
          </span>
        </div>

        <SkinDivider skin={skin.id} className="mt-3" />
      </div>

      <div className="flex items-center justify-between border-t px-4 py-2.5" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
        {active ? (
          <span className="text-[12.5px] font-semibold" style={{ color: 'var(--primary)' }}>
            ✓ Active skin
          </span>
        ) : (
          <span className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
            Tap to apply
          </span>
        )}
        <button
          type="button"
          onClick={onSelect}
          disabled={active}
          className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
          style={{ background: 'var(--accent-fill)', color: 'var(--on-primary)' }}
        >
          {active ? 'In use' : 'Use this skin'}
        </button>
      </div>
    </div>
  )
}

function SkinGalleryScreen() {
  const activeSkin = useSkin((s) => s.skin)
  const activeMode = useSkin((s) => s.mode)
  const resolvedMode = useSkin((s) => s.resolvedMode)
  const { setSkin, setMode } = useSkinControls()

  return (
    <section className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="text-[22px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
        Skins
      </h1>
      <p className="mt-1 text-[13px] text-muted">
        A skin restyles the whole app — palette, type, and ambiance — to fit what you read. Light and
        dark is a separate choice; previews update with it.
      </p>

      <div className="mt-4 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.15em] text-muted">Preview in</span>
        {(
          [
            ['light', '☀ Light'],
            ['dark', '☾ Dark'],
            ['system', '◐ System'],
          ] as [Mode, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            aria-pressed={activeMode === value}
            className="rounded-full border px-3 py-1.5 text-[12.5px] font-semibold"
            style={
              activeMode === value
                ? { background: 'var(--accent-fill)', color: 'var(--on-primary)', borderColor: 'transparent' }
                : { background: 'var(--field)', color: 'var(--ink)', borderColor: 'var(--line)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {SKIN_LIST.map((s) => (
          <SkinCard key={s.id} skin={s} mode={resolvedMode} active={activeSkin === s.id} onSelect={() => setSkin(s.id)} />
        ))}
      </div>
    </section>
  )
}

export const skinsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'skins',
  component: SkinGalleryScreen,
})
