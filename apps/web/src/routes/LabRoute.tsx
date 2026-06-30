import { createRoute } from '@tanstack/react-router'
import { type SkinId } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { Nameplate } from '../components/Nameplate'

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
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.7rem', color: 'var(--ink)' }}
        >
          CL
        </div>
        <span
          className="absolute left-1.5 top-1.5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
          style={{ background: SCRIM, color: 'var(--mark-accent)', borderRadius: 'var(--mark-radius)' }}
        >
          Read
        </span>
        <span
          className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center text-[14px]"
          style={{ background: SCRIM, color: 'var(--mark-accent)', borderRadius: 'var(--mark-radius)' }}
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

function Cell({ skin, mode, label }: { skin: SkinId; mode: 'dark' | 'light'; label: string }) {
  return (
    <div
      data-skin={skin}
      data-mode={mode}
      className="relative overflow-hidden rounded-2xl border border-line p-5"
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
              eyebrow="The Vieux Carré · Book II"
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
      </div>
    </div>
  )
}

function SkinLab() {
  return (
    <div className="mx-auto min-h-dvh max-w-[1120px] px-6 py-10" style={{ background: 'var(--bg0)' }}>
      <h1 className="text-[24px] font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
        Skin character — two worlds
      </h1>
      <p className="mt-1 text-[13px] text-muted">
        Tryst vs Aphelion · dark + light. Texture · card marks · nameplate · stat panel — all from the
        token contract.
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
