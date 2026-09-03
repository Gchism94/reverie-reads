import type { ResolvedMode, SkinId } from '@reverie/core'

export type SkinAtmosphereKind = 'fracture' | 'fog' | 'stars' | null

/** Motion is a scarce material: only rooms where it clarifies the fiction receive it. */
export function atmosphereForSkin(skin: SkinId, mode: ResolvedMode): SkinAtmosphereKind {
  if (skin === 'marrow') return 'fracture'
  if (skin === 'umbra') return 'fog'
  if (skin === 'bloom' && mode === 'dark') return 'stars'
  return null
}
