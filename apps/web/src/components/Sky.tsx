import { useEffectiveSkin } from '../skin/labels'
import { useSkin } from '../skin/useSkin'
import { SkinAtmosphereCanvas } from './SkinAtmosphereCanvas'

/** Every room owns its light, architecture and material. The same scene runs in public previews. */
export function Sky() {
  const skin = useEffectiveSkin()
  const mode = useSkin((state) => state.resolvedMode)
  const adaptiveBundle = useSkin((state) =>
    state.skin === 'adaptive' ? state.adaptiveBundle : null,
  )
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <SkinAtmosphereCanvas skin={skin} mode={mode} adaptiveBundle={adaptiveBundle} />
    </div>
  )
}
