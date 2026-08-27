import { useEffect, useMemo, type CSSProperties } from 'react'
import { createRoute } from '@tanstack/react-router'
import {
  SKINS,
  SKIN_LIST,
  type AdaptiveBundle,
  type Mode,
  type ResolvedMode,
  type Skin,
} from '@reverie/core'
import { rootRoute } from './RootRoute'
import { useBooks } from '../data/books'
import { useProfile } from '../data/profile'
import { useSkin } from '../skin/useSkin'
import { loadAllSkinFonts } from '../skin/fonts'
import { useSkinControls, useAdaptiveControls } from '../skin/controls'
import { adaptiveVars, generateAdaptiveBundle } from '../skin/adaptive'
import { SkinDivider } from '../components/SkinDivider'
import { Surface } from '../components/Surface'
import { Spine } from '../components/Spine'
import { SignatureRing } from '../components/Structure'
import { PageHeader } from '../components/PageHeader'

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
      className="relative isolate overflow-hidden border"
      style={{
        background: 'var(--bg)',
        borderColor: active ? 'var(--primary)' : 'var(--line)',
        borderRadius: 'var(--radius-panel)',
        boxShadow: active ? 'var(--shadow)' : undefined,
      }}
    >
      <div className="rv-skin-texture" />
      <div className="relative p-5">
        <div className="skin-label text-[10px]" style={{ color: 'var(--accent-ink)' }}>
          {skin.genre}
        </div>
        <div
          className="mt-1 text-[27px] leading-none"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)', fontWeight: 600 }}
        >
          {skin.label}
        </div>
        <div
          className="mt-2 min-h-[38px] text-[12px] leading-relaxed"
          style={{ color: 'var(--muted)' }}
        >
          {skin.tagline}
        </div>

        <div
          className="mt-4 grid grid-cols-[40px_minmax(0,1fr)] gap-3 border p-3"
          style={{
            borderColor: 'var(--line)',
            borderRadius: 'var(--radius-card)',
            background: 'var(--panel-fill)',
          }}
        >
          <div
            className="flex flex-col items-center gap-3 border-r pt-1"
            style={{ borderColor: 'var(--line)' }}
          >
            <span
              className="h-2 w-2"
              style={{ borderRadius: 'var(--radius-control)', background: 'var(--primary)' }}
            />
            <span
              className="h-2 w-2 opacity-50"
              style={{ borderRadius: 'var(--radius-control)', background: 'var(--muted)' }}
            />
            <span
              className="h-2 w-2 opacity-50"
              style={{ borderRadius: 'var(--radius-control)', background: 'var(--muted)' }}
            />
          </div>
          <div className="grid grid-cols-[54px_minmax(0,1fr)] items-center gap-3">
            <div className="flex h-[154px] items-end justify-center overflow-hidden">
              <Spine
                book={{
                  id: `gallery-${skin.id}`,
                  title: 'Crimson Letters',
                  first: 'D',
                  last: 'Marchand',
                }}
                skin={skin.id}
              />
            </div>
            <div className="min-w-0">
              <div className="skin-label text-[8px]" style={{ color: 'var(--accent-ink)' }}>
                Currently reading
              </div>
              <div
                className="mt-2 text-[16px] font-semibold leading-[1.05]"
                style={{ color: 'var(--ink)', fontFamily: 'var(--font-display)' }}
              >
                Crimson Letters
              </div>
              <div className="mt-2">
                <SignatureRing value={42} max={60} size={58} skin={skin.id} />
              </div>
              <span className="skin-control skin-btn-primary mt-3 inline-grid h-8 place-items-center px-3 text-[9px]">
                Continue
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {['Typography', 'Material', 'Controls'].map((label) => (
            <span
              key={label}
              className="skin-control border px-2 py-1 text-[8px]"
              style={{
                borderColor: 'var(--chip-border)',
                background: 'var(--chip)',
                color: 'var(--ink)',
              }}
            >
              {label}
            </span>
          ))}
        </div>

        <SkinDivider skin={skin.id} className="mt-4" />
      </div>

      <div
        className="relative flex items-center justify-between border-t px-5 py-3"
        style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
      >
        {active ? (
          // --accent-ink, NOT --primary: primary is a fill/glyph accent tuned (at best) against
          // --bg, never against --card — hearth/dark measured 2.24:1 here (a11y sweep, 2026-08-10).
          // accent-ink is the registry's card-safe accent text, pinned on card-solid across all
          // nine skins by skinCharacter.contrast.test.ts.
          <span className="text-[12.5px] font-semibold" style={{ color: 'var(--accent-ink)' }}>
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
          className="skin-control skin-btn-primary h-9 px-4 text-[11px] disabled:opacity-50"
        >
          {active ? 'In use' : 'Use this skin'}
        </button>
      </div>
    </div>
  )
}

function AdaptiveCard({
  bundle,
  mode,
  active,
}: {
  bundle: AdaptiveBundle
  mode: ResolvedMode
  active: boolean
}) {
  // Paint the card with the generated palette via inline vars; data-skin lets the base rule derive
  // the translucent tokens (--field/--chip) from this palette's --ink.
  const vars = adaptiveVars(bundle, mode) as unknown as CSSProperties
  return (
    <div
      data-skin="adaptive"
      data-mode={mode}
      className="overflow-hidden rounded-2xl border"
      style={{
        ...vars,
        background: 'var(--bg0)',
        borderColor: active ? 'var(--primary)' : 'var(--line)',
      }}
    >
      <div className="p-4">
        <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
          Adaptive · blended from your reading
        </div>
        <div
          className="mt-0.5 text-[22px] leading-tight"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)', fontWeight: 600 }}
        >
          Your skin
        </div>
        <div className="mt-1 text-[13px]" style={{ color: 'var(--muted)' }}>
          {bundle.insight} · echoes {SKINS[bundle.dominant].label}
        </div>
        <div className="mt-3 flex gap-1.5">
          {(['--bg0', '--card', '--primary', '--accent-fill', '--gold'] as const).map((v) => (
            <span
              key={v}
              className="h-5 w-5 rounded-full border"
              style={{ background: `var(${v})`, borderColor: 'var(--chip-border)' }}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="skin-control border px-3 py-1 text-[12px] font-medium"
            style={{
              background: 'var(--chip)',
              color: 'var(--ink)',
              borderColor: 'var(--chip-border)',
            }}
          >
            Sample tag
          </span>
          <span
            className="skin-control px-3 py-1 text-[12px] font-semibold"
            style={{ background: 'var(--accent-fill)', color: 'var(--on-primary)' }}
          >
            Primary
          </span>
          <span className="text-[12px]" style={{ color: 'var(--primary)' }}>
            A link
          </span>
        </div>
        <SkinDivider skin={bundle.dominant} className="mt-3" />
      </div>
    </div>
  )
}

function AdaptiveSection({ mode }: { mode: ResolvedMode }) {
  const { data: books } = useBooks()
  const { data: profile } = useProfile()
  const activeSkin = useSkin((s) => s.skin)
  const { regenerate, revert, setLocked } = useAdaptiveControls()
  const isActive = activeSkin === 'adaptive'
  const locked = profile?.adaptiveLocked ?? false

  // Live preview of what a regenerate would produce from the current library (AA-nudged in core).
  const preview = useMemo(() => generateAdaptiveBundle(books ?? []), [books])

  return (
    <div className="mt-8">
      <h2 className="text-[16px] font-semibold text-ink">Adaptive skin</h2>
      <p className="mt-1 text-[13px] text-muted">
        A one-of-a-kind palette blended from the Tier-1 skins, weighted by what you actually read
        and love. Regenerate it whenever your taste shifts.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <AdaptiveCard bundle={preview} mode={mode} active={isActive} />
        <Surface tone="card" radius="card" pad={3} className="flex flex-col justify-center gap-2">
          <button
            type="button"
            onClick={() => regenerate()}
            className="skin-control px-4 py-2 text-[13px] font-semibold"
            style={{ background: 'var(--accent-fill)', color: 'var(--on-primary)' }}
          >
            {isActive ? 'Regenerate from my reading' : 'Generate & use this'}
          </button>
          {isActive && (
            <button
              type="button"
              onClick={() => revert(preview.dominant)}
              className="skin-control border border-line px-4 py-2 text-[13px] font-semibold text-ink"
              style={{ background: 'var(--field)' }}
            >
              Revert to {SKINS[preview.dominant].label}
            </button>
          )}
          <button
            type="button"
            onClick={() => setLocked(!locked)}
            className="skin-control border border-line px-4 py-2 text-[13px] font-semibold text-ink"
            style={{ background: 'var(--field)' }}
          >
            {locked ? '🔒 Locked — unlock to evolve' : '🔓 Lock this skin'}
          </button>
          <p className="text-[12px] text-muted">
            {isActive ? 'Active.' : 'Not in use yet.'} Locking stops the monthly refresh from
            changing it.
          </p>
        </Surface>
      </div>
    </div>
  )
}

function SkinGalleryScreen() {
  const activeSkin = useSkin((s) => s.skin)
  const activeMode = useSkin((s) => s.mode)
  const resolvedMode = useSkin((s) => s.resolvedMode)
  const { setSkin, setMode } = useSkinControls()
  // The gallery previews every skin in its true type, so load all pairings here (only here).
  useEffect(() => loadAllSkinFonts(), [])

  return (
    <section className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader
        eyebrow="Choose your atmosphere"
        title="Genre rooms"
        description="Each skin changes the objects, rhythm, typography, and voice of Reverie. Color is only the beginning."
      />

      <div className="mt-5 flex flex-wrap items-center gap-2">
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
            className="skin-control border px-3 py-1.5 text-[12.5px] font-semibold"
            style={
              activeMode === value
                ? {
                    background: 'var(--accent-fill)',
                    color: 'var(--on-primary)',
                    borderColor: 'transparent',
                  }
                : { background: 'var(--field)', color: 'var(--ink)', borderColor: 'var(--line)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {SKIN_LIST.map((s) => (
          <SkinCard
            key={s.id}
            skin={s}
            mode={resolvedMode}
            active={activeSkin === s.id}
            onSelect={() => setSkin(s.id)}
          />
        ))}
      </div>

      <AdaptiveSection mode={resolvedMode} />
    </section>
  )
}

export const skinsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'skins',
  component: SkinGalleryScreen,
})
