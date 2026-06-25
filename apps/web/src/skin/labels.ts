import { REVERIE_LABELS, type FieldLabels } from '@reverie/core'

/**
 * Field labels for the active skin. The data model is generic (tags / intensity / genre); the
 * UI reads its labels from here so the Reverie skin still shows "Tropes" / "Spice" while other
 * skins can show "Tags" / "Intensity". C2 wires this to the skin registry's active skin; until
 * then it resolves to the Reverie labels (the only shipped skin).
 */
export function useLabels(): FieldLabels {
  return REVERIE_LABELS
}
