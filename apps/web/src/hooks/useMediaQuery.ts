import { useEffect, useState } from 'react'

/**
 * Subscribe to a CSS media query. Returns whether it currently matches, updating on change.
 * SSR/no-matchMedia safe (returns false). Used to branch desktop-only behavior — e.g. the
 * Library master-detail rail (select-in-place on wide screens, navigate on narrow).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** The Library master-detail breakpoint (lg): at/above this, selecting a book shows the detail rail
 *  in place (docked column at xl, overlay drawer between lg and xl) instead of navigating. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}

/** The "wide" breakpoint (xl): at/above this the detail rail is a persistent docked column; between
 *  lg and xl it becomes an overlay drawer so the cover grid keeps comfortable columns. */
export function useIsWide(): boolean {
  return useMediaQuery('(min-width: 1280px)')
}
