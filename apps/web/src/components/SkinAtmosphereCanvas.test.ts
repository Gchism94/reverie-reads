import { describe, expect, it } from 'vitest'
import { SKINS, type ResolvedMode, type SkinId } from '@reverie/core'
import { atmosphereForSkin } from './skinAtmosphere'

describe('atmosphereForSkin', () => {
  it('animates only the rooms where motion adds meaning', () => {
    const expected: Record<SkinId, Record<ResolvedMode, string | null>> = {
      tryst: { light: null, dark: null },
      grimoire: { light: null, dark: null },
      aphelion: { light: null, dark: null },
      marrow: { light: 'fracture', dark: 'fracture' },
      umbra: { light: 'fog', dark: 'fog' },
      folio: { light: null, dark: null },
      hearth: { light: null, dark: null },
      almanac: { light: null, dark: null },
      bloom: { light: null, dark: 'stars' },
    }

    for (const skin of Object.keys(SKINS) as SkinId[]) {
      for (const mode of ['light', 'dark'] as const) {
        expect(atmosphereForSkin(skin, mode), `${skin}/${mode}`).toBe(expected[skin][mode])
      }
    }
  })
})
