import { useEffectiveSkin } from '../skin/labels'
import { useSkin } from '../skin/useSkin'
import { SkinAtmosphereCanvas } from './SkinAtmosphereCanvas'

/**
 * The app background is primarily material and light. Motion is reserved for three rooms where it
 * clarifies the fiction: Marrow's edge fractures, Gaslight's fog, and Firstlight's night stars.
 */
export function Sky() {
  const skin = useEffectiveSkin()
  const mode = useSkin((state) => state.resolvedMode)

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 72% 58% at 8% 0%, var(--glow-a), transparent 72%), radial-gradient(ellipse 68% 54% at 96% 18%, var(--glow-b), transparent 74%), radial-gradient(ellipse 76% 44% at 45% 106%, var(--glow-c), transparent 76%)',
          opacity: 0.54,
        }}
      />
      <SkinAtmosphereCanvas skin={skin} mode={mode} />

      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 28vmax var(--vignette)' }} />

      {/* The DESK EDGE (Marginalia): a tighter, harder ring so the surface behind the page reads as
          a real desk, not a dimmer page — "dark mode darkens the desk, never the page." Neutral
          default is transparent, so only skins that set --desk-edge draw anything. */}
      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 9vmax var(--desk-edge)' }} />

      {/* Per-skin material (Skin Character 1b): Tryst gilt-paper grain, Aphelion instrument mesh.
          Token-driven and static (no motion) — neutral skins render nothing. */}
      <div className="rv-skin-texture" />
    </div>
  )
}
