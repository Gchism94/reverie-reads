import { useEffect } from 'react'
import type { Mode, SkinId } from '@reverie/core'
import { useProfile, useUpdateProfile } from '../data/profile'
import { useSkin } from './useSkin'

/**
 * Setters that apply a skin/mode change locally (instant) AND persist it to the profile
 * (cross-device). Use these from any signed-in surface instead of the raw store setters.
 */
export function useSkinControls() {
  const setSkinLocal = useSkin((s) => s.setSkin)
  const setModeLocal = useSkin((s) => s.setMode)
  const update = useUpdateProfile()
  return {
    setSkin: (id: SkinId) => {
      setSkinLocal(id)
      update.mutate({ skin: id })
    },
    setMode: (mode: Mode) => {
      setModeLocal(mode)
      update.mutate({ mode })
    },
  }
}

/** Reconcile the store with the signed-in profile (the cross-device source of truth). Applies
 * whenever the profile's skin/mode changes — on sign-in, and if another device updates them.
 * No loop: the controls update store + profile together, so an echoed value is a no-op. */
export function useSkinSync() {
  const skin = useProfile().data?.skin
  const mode = useProfile().data?.mode
  const hydrate = useSkin((s) => s.hydrate)
  useEffect(() => {
    if (skin && mode) hydrate(skin, mode)
  }, [skin, mode, hydrate])
}
