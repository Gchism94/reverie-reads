import {
  TASTE_TIER_TOKEN,
  tasteTierIndex,
  tasteTierLabel,
  tastePercentAnchored,
  type TasteAnchors,
} from '@reverie/core'
import { useEffectiveSkin } from '../skin/labels'

const TOKEN_VAR = {
  'accent-ink': 'var(--accent-ink)',
  ink: 'var(--ink)',
  muted: 'var(--muted)',
} as const

/**
 * The named taste tier — the HEADLINE of match strength (replacing the old per-shelf "% you"). The
 * word is a per-skin token (Aphelion "Dead center" · Tryst "Made for you" · …); the calibrated
 * percentage rides underneath as the drill-down (the `title` tooltip / on-tap), never the headline.
 * Colour comes from an already-AA-tested skin token per tier (accent → ink → muted, strong → floor),
 * so it clears the registry-keyed contrast test for every skin × mode.
 *
 * Renders nothing without anchors (cold start) or a score — absence is a fine answer, like the rest of
 * the Tier-2 surface.
 */
export function TasteTier({
  cos,
  anchors,
  className = 'text-[11px] font-bold',
}: {
  cos: number | null | undefined
  anchors: TasteAnchors | null | undefined
  className?: string
}) {
  const skin = useEffectiveSkin()
  if (cos == null || !anchors) return null
  const index = tasteTierIndex(cos, anchors)
  const label = tasteTierLabel(skin, index)
  const pct = tastePercentAnchored(cos, anchors)
  return (
    <span
      className={`skin-label ${className}`}
      style={{ color: TOKEN_VAR[TASTE_TIER_TOKEN[index]] }}
      title={`${pct}% match to your taste`}
    >
      {label}
    </span>
  )
}
