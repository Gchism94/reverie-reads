import { SKINS, type FieldLabels } from '@reverie/core'
import { useSkin } from './useSkin'

/**
 * Field labels for the active skin. The data model is generic (tags / intensity / genre); each
 * skin chooses how to label those — the Reverie (romance) skin shows "Tropes" / "Spice", the
 * others show "Tags" / "Intensity". UI reads labels from here, never hardcoded.
 */
export function useLabels(): FieldLabels {
  const skin = useSkin((s) => s.skin)
  return SKINS[skin].labels
}
