import { useEffect, useRef } from 'react'

/** A pool of lamplight behind the front door. Animate only the light's transform and opacity;
 * the browser owns the frames, and the reading surfaces never move or change brightness. */
export function BrandAtmosphere() {
  const lightRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const light = lightRef.current
    if (!light || typeof light.animate !== 'function') return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let animation: Animation | undefined
    const sync = () => {
      if (reducedMotion.matches) {
        animation?.cancel()
        animation = undefined
        return
      }
      if (document.hidden) {
        animation?.pause()
        return
      }
      if (animation) {
        animation.play()
      } else {
        animation = light.animate(
          [
            { opacity: 0.52, transform: 'translate3d(0, 0, 0) scale(1)' },
            { opacity: 0.72, transform: 'translate3d(-1.5%, 1%, 0) scale(1.035)' },
            { opacity: 0.46, transform: 'translate3d(1%, -0.5%, 0) scale(0.985)' },
          ],
          { duration: 24000, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' },
        )
      }
    }
    reducedMotion.addEventListener('change', sync)
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => {
      animation?.cancel()
      reducedMotion.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])
  return (
    <div aria-hidden="true" className="brand-atmosphere">
      <div ref={lightRef} className="brand-lamplight" data-testid="brand-lamplight" />
    </div>
  )
}
