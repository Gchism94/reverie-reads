import { SKINS, type FieldLabels, type SkinId } from '@reverie/core'
import { useSkin } from './useSkin'

/** The active Tier-1 skin id, resolving the adaptive skin to its dominant Tier-1 skin. */
export function useEffectiveSkin(): SkinId {
  const skin = useSkin((s) => s.skin)
  const dominant = useSkin((s) => s.adaptiveBundle?.dominant)
  return skin === 'adaptive' ? (dominant ?? 'reverie') : skin
}

/**
 * Field labels for the active skin. The data model is generic (tags / intensity / genre); each
 * skin chooses how to label those — the Reverie (romance) skin shows "Tropes" / "Spice", the
 * others show "Tags" / "Intensity". UI reads labels from here, never hardcoded.
 */
export function useLabels(): FieldLabels {
  return SKINS[useEffectiveSkin()].labels
}
