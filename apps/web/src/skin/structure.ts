import { SKIN_STRUCTURE, type SkinId, type SkinStructure } from '@reverie/core'
import { useEffectiveSkin } from './labels'

/** The active skin's STRUCTURAL config (which bones a region has), wired like useLabels / useVoice.
 *  Pass `skin` to force one (gallery / structure preview); otherwise it follows the active skin. */
export function useStructure(skin?: SkinId): SkinStructure {
  const active = useEffectiveSkin()
  return SKIN_STRUCTURE[skin ?? active]
}
