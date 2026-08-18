import { useEffect } from 'react'
import { createRoute } from '@tanstack/react-router'
import { type SkinId } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { Nameplate } from '../components/Nameplate'
import { loadAllSkinFonts } from '../skin/fonts'
import { Surface } from '../components/Surface'

/**
 * Skin-character eyeball (Stage 1b). Renders Tryst vs Aphelion side by side, in both modes, on a
 * representative composite — textured surface + book card (with marks) + the detail-rail nameplate +
 * a textured stat panel — so the "two worlds / a place" verdict can be made at a glance.
 *
 * Each cell scopes `data-skin` + `data-mode` on its wrapper, so every token resolves locally (the
 * tokens key off those attributes, not the global store). This is a contract-OUTPUT preview: it uses
 * the real Nameplate + the real `.rv-skin-texture` / `.skin-plate` / `.skin-card` / mark tokens, but
 * with skin/mode passed as props (the live app drives the same tokens from the skin store). Reachable
 * at `/lab/skins` without auth (see RootRoute) — synthetic content only.
 */
const CELLS: { skin: SkinId; mode: 'dark' | 'light'; label: string }[] = [
  { skin: 'tryst', mode: 'dark', label: 'Tryst · dark' },
  { skin: 'tryst', mode: 'light', label: 'Tryst · light' },
  { skin: 'aphelion', mode: 'dark', label: 'Aphelion · dark' },
  { skin: 'aphelion', mode: 'light', label: 'Aphelion · light' },
  { skin: 'grimoire', mode: 'dark', label: 'Grimoire · dark' },
  { skin: 'grimoire', mode: 'light', label: 'Grimoire · light' },
  { skin: 'marrow', mode: 'dark', label: 'Marrow · dark' },
  { skin: 'marrow', mode: 'light', label: 'Marrow · light' },
  { skin: 'umbra', mode: 'dark', label: 'Gaslight · dark' },
  { skin: 'umbra', mode: 'light', label: 'Gaslight · light' },
  { skin: 'folio', mode: 'dark', label: 'Folio · dark' },
  { skin: 'folio', mode: 'light', label: 'Folio · light' },
  { skin: 'hearth', mode: 'dark', label: 'Hearth · dark' },
  { skin: 'hearth', mode: 'light', label: 'Hearth · light' },
  { skin: 'almanac', mode: 'dark', label: 'Almanac · dark' },
  { skin: 'almanac', mode: 'light', label: 'Almanac · light' },
  { skin: 'bloom', mode: 'dark', label: 'Bloom · dark' },
  { skin: 'bloom', mode: 'light', label: 'Bloom · light' },
]

const SCRIM = 'rgba(0,0,0,0.45)'

/** A book card matching CoverCard's idiom: `skin-card` radius, accent + `--mark-radius` marks. */
function LabCard() {
  return (
    <div className="w-[150px] shrink-0">
      <div
        className="skin-card relative aspect-[2/3] overflow-hidden border border-line"
        style={{ background: 'linear-gradient(150deg, var(--card-2), var(--bg1))' }}
      >
        <div
          className="grid h-full w-full place-items-center italic"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: '1.7rem',
            color: 'var(--ink)',
          }}
        >
          CL
        </div>
        <span
          className="absolute left-1.5 top-1.5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
          style={{
            background: SCRIM,
            color: 'var(--mark-accent)',
            borderRadius: 'var(--mark-radius)',
          }}
        >
          Read
        </span>
        <span
          className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center text-[14px]"
          style={{
            background: SCRIM,
            color: 'var(--mark-accent)',
            borderRadius: 'var(--mark-radius)',
          }}
        >
          ♥
        </span>
        <div
          className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 text-[9px]"
          style={{ background: SCRIM, color: '#fff', borderRadius: 'var(--mark-radius)' }}
        >
          🌶🌶🌶
        </div>
      </div>
      <div className="mt-1.5 truncate text-[12.5px] font-semibold text-ink">Crimson Letters</div>
      <div className="truncate text-[11.5px] text-muted">Delphine Marchand</div>
    </div>
  )
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <div className="skin-numeral text-[26px] font-bold leading-none text-ink">{n}</div>
      <div className="skin-label mt-1.5 text-[10px] text-muted">{l}</div>
    </div>
  )
}

/** Mini goal ring matching HomeRoute's GoalRing — Aphelion reads as a segmented instrument gauge. */
function LabRing({ aph }: { aph: boolean }) {
  const C = 2 * Math.PI * 20
  return (
    <div className="relative h-14 w-14 flex-none">
      <svg width="56" height="56" className="-rotate-90">
        <circle
          cx="28"
          cy="28"
          r="20"
          fill="none"
          stroke="var(--chip-border)"
          strokeWidth="6"
          strokeDasharray={aph ? '1 4' : undefined}
        />
        <circle
          cx="28"
          cy="28"
          r="20"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="6"
          strokeLinecap={aph ? 'butt' : 'round'}
          strokeDasharray={C}
          strokeDashoffset={C * 0.3}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="skin-numeral text-[13px] font-bold text-ink">42</span>
      </div>
    </div>
  )
}

/** The 1c control silhouette fan-out: button · search field · select · toggle · goal ring. */
function LabControls({ skin }: { skin: SkinId }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button
        type="button"
        className="skin-control px-3.5 py-2 text-[12px]"
        style={{ background: 'var(--accent-fill)', color: 'var(--on-primary)' }}
      >
        Begin
      </button>
      <input
        readOnly
        placeholder="Search…"
        className="skin-field h-9 w-32 border border-line px-3 text-[12px] text-ink outline-none"
        style={{ background: 'var(--field)' }}
      />
      <span
        className="skin-control inline-flex items-center border border-line px-3 py-2 text-[12px] text-ink"
        style={{ background: 'var(--card)' }}
      >
        Sort ▾
      </span>
      <span
        className="relative inline-block h-6 w-11 border border-line"
        style={{
          borderRadius: 'var(--radius-control)',
          background: 'linear-gradient(135deg, var(--primary), var(--gold))',
        }}
      >
        <span
          className="absolute top-[2px] h-[18px] w-[18px] bg-white"
          style={{ left: 'calc(100% - 20px)', borderRadius: 'var(--radius-control)' }}
        />
      </span>
      <LabRing aph={skin === 'aphelion'} />
    </div>
  )
}

function Cell({ skin, mode, label }: { skin: SkinId; mode: 'dark' | 'light'; label: string }) {
  return (
    <Surface
      data-skin={skin}
      data-mode={mode}
      tone="bare"
      radius="card"
      pad={4}
      className="relative overflow-hidden"
      style={{ background: 'var(--bg0)', color: 'var(--ink)' }}
    >
      <div className="rv-skin-texture" />
      <div className="relative flex flex-col gap-5">
        <div className="skin-label text-[10px] text-muted">{label}</div>
        <div className="flex flex-wrap items-start gap-5">
          <LabCard />
          <div className="flex min-w-[220px] flex-1 flex-col gap-4">
            <Nameplate
              skin={skin}
              align="start"
              eyebrow="Series · Book II"
              title="Crimson Letters"
              subtitle="Delphine Marchand"
            />
            <div className="skin-plate skin-panel flex gap-7 px-5 py-4">
              <Stat n="248" l="Volumes" />
              <Stat n="11,920" l="Pages" />
              <Stat n="17" l="Streak" />
            </div>
          </div>
        </div>
        <LabControls skin={skin} />
      </div>
    </Surface>
  )
}

function SkinLab() {
  // Each cell forces a skin via data-skin; load every pairing so they render in their true type.
  useEffect(() => loadAllSkinFonts(), [])
  return (
    <div
      className="mx-auto min-h-dvh max-w-[1120px] px-6 py-10"
      style={{ background: 'var(--bg0)' }}
    >
      <h1 className="text-[24px] font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
        Skin character — nine worlds
      </h1>
      <p className="mt-1 text-[13px] text-muted">
        All nine skins, dark + light. Texture · card marks · nameplate · stat panel · controls
        (button · search · select · toggle · goal ring) — all from the token contract.
      </p>
      <div className="mt-7 grid gap-6 lg:grid-cols-2">
        {CELLS.map((c) => (
          <Cell key={`${c.skin}/${c.mode}`} {...c} />
        ))}
      </div>
    </div>
  )
}

export const labRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'lab/skins',
  component: SkinLab,
})
