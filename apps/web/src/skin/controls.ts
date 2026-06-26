import { useEffect, useRef } from 'react'
import type { ActiveSkin, Mode } from '@reverie/core'
import { useProfile, useUpdateProfile } from '../data/profile'
import { useBooks } from '../data/books'
import { useSkin } from './useSkin'
import { generateAdaptiveBundle } from './adaptive'

/**
 * Setters that apply a skin/mode change locally (instant) AND persist it to the profile
 * (cross-device). Use these from any signed-in surface instead of the raw store setters.
 */
export function useSkinControls() {
  const setSkinLocal = useSkin((s) => s.setSkin)
  const setModeLocal = useSkin((s) => s.setMode)
  const update = useUpdateProfile()
  return {
    setSkin: (id: ActiveSkin) => {
      setSkinLocal(id)
      update.mutate({ skin: id })
    },
    setMode: (mode: Mode) => {
      setModeLocal(mode)
      update.mutate({ mode })
    },
  }
}

/**
 * Adaptive-skin actions: regenerate from the current library, keep (adopt), revert (back to a
 * Tier-1 skin), and lock/unlock (freeze against future auto-evolution). All persist to the profile.
 */
export function useAdaptiveControls() {
  const { data: books } = useBooks()
  const setSkinLocal = useSkin((s) => s.setSkin)
  const setBundle = useSkin((s) => s.setAdaptiveBundle)
  const update = useUpdateProfile()

  return {
    /** Recompute the blend from the library, store + adopt it. */
    regenerate: () => {
      const bundle = generateAdaptiveBundle(books ?? [])
      setBundle(bundle)
      setSkinLocal('adaptive')
      update.mutate({ adaptiveSkin: bundle, skin: 'adaptive' })
      return bundle
    },
    /** Adopt the already-generated adaptive skin as active. */
    keep: () => {
      setSkinLocal('adaptive')
      update.mutate({ skin: 'adaptive' })
    },
    /** Switch away from adaptive to a Tier-1 skin (defaults to the blend's dominant). */
    revert: (to: ActiveSkin) => {
      setSkinLocal(to)
      update.mutate({ skin: to })
    },
    setLocked: (locked: boolean) => update.mutate({ adaptiveLocked: locked }),
  }
}

/** Reconcile the store with the signed-in profile (the cross-device source of truth). Applies
 * whenever the profile's skin/mode/adaptive bundle change — on sign-in, and if another device
 * updates them. No loop: the controls update store + profile together, so an echo is a no-op. */
export function useSkinSync() {
  const { data: profile } = useProfile()
  const hydrate = useSkin((s) => s.hydrate)
  const sig = useRef('')
  const skin = profile?.skin
  const mode = profile?.mode
  const bundle = profile?.adaptiveSkin ?? null
  useEffect(() => {
    if (!skin || !mode) return
    const next = `${skin}|${mode}|${bundle ? 'b' : '0'}`
    if (next === sig.current) return
    sig.current = next
    hydrate(skin, mode, bundle)
  }, [skin, mode, bundle, hydrate])
}
