import { useMemo, type CSSProperties } from 'react'
import { SKINS } from '@reverie/core'
import { useEffectiveSkin } from '../skin/labels'

type Star = { top: string; left: string; size: number; delay: string; duration: string }

/** Deterministic pseudo-random so the starfield is stable across renders. */
function makeStars(count: number): Star[] {
  const stars: Star[] = []
  let seed = 9
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  for (let i = 0; i < count; i++) {
    stars.push({
      top: `${(rand() * 100).toFixed(2)}%`,
      left: `${(rand() * 100).toFixed(2)}%`,
      size: rand() < 0.85 ? 1 : 2,
      delay: `${(rand() * 6).toFixed(2)}s`,
      duration: `${(3 + rand() * 5).toFixed(2)}s`,
    })
  }
  return stars
}

function glow(color: string, size: string, pos: CSSProperties, anim: string): CSSProperties {
  return {
    position: 'absolute',
    width: size,
    height: size,
    borderRadius: '50%',
    background: `radial-gradient(circle, ${color}, transparent 70%)`,
    filter: 'blur(8px)',
    opacity: 0.5,
    mixBlendMode: 'screen',
    animationName: anim,
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
    ...pos,
  }
}

/**
 * The signature living night sky: soft radial glows that drift and breathe, a faint
 * starfield, a slow fog drift, and a vignette. All motion is gated by `.rv-anim`, which
 * `prefers-reduced-motion` disables (see tokens.css).
 */
export function Sky() {
  const skin = useEffectiveSkin()
  const stars = useMemo(() => makeStars(SKINS[skin].starDensity), [skin])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="rv-anim"
        style={{ ...glow('var(--glow-a)', '60vmax', { top: '-15%', left: '-10%' }, 'rv-drift-a'), animationDuration: '34s' }}
      />
      <div
        className="rv-anim"
        style={{ ...glow('var(--glow-b)', '50vmax', { top: '8%', right: '-12%' }, 'rv-drift-b'), animationDuration: '41s' }}
      />
      <div
        className="rv-anim"
        style={{ ...glow('var(--glow-c)', '55vmax', { bottom: '-20%', left: '12%' }, 'rv-drift-c'), animationDuration: '45s' }}
      />
      <div
        className="rv-anim"
        style={{
          ...glow('var(--glow-d)', '34vmax', { bottom: '-8%', right: '4%' }, 'rv-drift-d'),
          animationDuration: '38s',
          opacity: 0.32,
        }}
      />

      <div className="absolute inset-0">
        {stars.map((s, i) => (
          <span
            key={i}
            className="rv-anim absolute rounded-full"
            style={{
              top: s.top,
              left: s.left,
              width: s.size,
              height: s.size,
              background: 'var(--star)',
              animationName: 'rv-twinkle',
              animationTimingFunction: 'ease-in-out',
              animationIterationCount: 'infinite',
              animationDuration: s.duration,
              animationDelay: s.delay,
            }}
          />
        ))}
      </div>

      <div
        className="rv-anim absolute inset-x-[-20%] top-1/3 h-1/2"
        style={{
          background: 'radial-gradient(60% 100% at 50% 50%, var(--fog), transparent 70%)',
          animationName: 'rv-fog',
          animationTimingFunction: 'ease-in-out',
          animationIterationCount: 'infinite',
          animationDirection: 'alternate',
          animationDuration: '60s',
        }}
      />

      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 28vmax var(--vignette)' }} />

      {/* Per-skin material (Skin Character 1b): Tryst gilt-paper grain, Aphelion instrument mesh.
          Token-driven and static (no motion) — neutral skins render nothing. */}
      <div className="rv-skin-texture" />
    </div>
  )
}
