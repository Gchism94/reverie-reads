import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { snapHalfRating } from '@reverie/core'

/**
 * Five-star rating, whole or half stars.
 *
 * ── STEP IS OPT-IN, AND THAT IS THE TRUNCATION GUARD ────────────────────────────────────────────
 * `step` defaults to 1. Half stars exist only where a caller passes `step={0.5}` — the reader's own
 * rating (`books.rating`, `reads.rating`, both `numeric(2,1)`). The REVIEWS composer never passes
 * it, because `reviews.rating` is a cross-user `smallint`: a 4.5 sent there would silently
 * truncate. `useUpsertReview` additionally refuses non-integers loudly (see data/reviews.ts) —
 * the default here is the first fence, that throw is the one that cannot be forgotten at a new
 * call site.
 *
 * ── THE INTERACTIVE PATH IS A SLIDER, NOT A BUTTON ROW — the a11y is the feature ────────────────
 * Half steps have to be reachable without a pointer, and a screen reader has to say "3.5 stars",
 * not five booleans. That is the WAI-ARIA rating pattern: one `role="slider"` stop with
 * Left/Right = ±step, Home/End = 0/5, `aria-valuetext` carrying the human value. A button-per-star
 * group cannot express 3.5 without ten buttons or a hidden click-cycles-through-states affordance;
 * the slider gets keyboard, announcement, and touch for free. Pointer clicks still work per star:
 * the LEFT HALF of a star sets the half value when step=0.5, the right half the whole — and
 * clicking the current value clears to 0, the affordance the whole-star control already had.
 *
 * Rendering: each star is a chip-border glyph with a gold overlay clipped to 0/50/100% width —
 * same two colours the whole-star control used, so no new contrast pair is introduced.
 */
export function Stars({
  value,
  onChange,
  size = 20,
  step = 1,
}: {
  value: number
  onChange?: (v: number) => void
  size?: number
  step?: 1 | 0.5
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  // POINTER QUANTIZATION, deliberately local — the same clamp-and-snap policy as core's
  // snapHalfRating, generalized over `step` for what the interactive control may EMIT. It stays
  // here, unexported, on purpose: a step-parameterized `snapRating(raw, step)` in core would
  // invite `snapRating(x, 1)` on an import path and silently reopen the whole-star truncation
  // #289 closed. This is a third operation that merely RESEMBLES the two data coercions core
  // consolidated; resemblance is not identity, and exporting it would let someone "finish the
  // job" that must not be finished.
  const snap = (v: number) => Math.max(0, Math.min(5, Math.round(v / step) * step))
  // Display mode always renders the half grid: `step` bounds what an INTERACTIVE control can
  // emit (the truncation fence), but a read-only view of a stored 4.5 must show 4.5 — the
  // per-read rows and the format line render without a step prop. snapHalfRating IS this policy
  // (one place, #289); its isFinite guard is the one delta from the expression it replaces —
  // non-finite input now renders 0 rather than propagating NaN into aria labels and overlay
  // widths. Unreachable from a numeric column; strictly safer where it isn't.
  const shown = onChange ? snap(value) : snapHalfRating(value)
  const label = (v: number) => `${v % 1 === 0 ? v : v.toFixed(1)} star${v === 1 ? '' : 's'}`

  const fill = (i: number): '0%' | '50%' | '100%' => {
    if (shown >= i) return '100%'
    if (shown >= i - 0.5) return '50%'
    return '0%'
  }

  const star = (i: number) => (
    <span
      key={i}
      aria-hidden
      data-star={i}
      className="relative inline-block leading-none"
      style={{ fontSize: size, color: 'var(--chip-border)' }}
    >
      ★
      <span
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: fill(i), color: 'var(--gold)' }}
      >
        ★
      </span>
    </span>
  )

  if (!onChange) {
    return (
      <div className="flex gap-0.5" role="img" aria-label={`Rated ${label(shown)} of 5`}>
        {[1, 2, 3, 4, 5].map(star)}
      </div>
    )
  }

  const set = (v: number) => onChange(snap(v))

  const onKeyDown = (e: KeyboardEvent) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? step
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -step
          : null
    if (delta !== null) {
      e.preventDefault()
      set(shown + delta)
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      set(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      set(5)
    }
  }

  const onPointerDown = (e: PointerEvent) => {
    const target = (e.target as HTMLElement).closest('[data-star]')
    if (!target || !rootRef.current) return
    const i = Number(target.getAttribute('data-star'))
    const rect = target.getBoundingClientRect()
    const leftHalf = e.clientX - rect.left < rect.width / 2
    const v = step === 0.5 && leftHalf ? i - 0.5 : i
    // clicking the value you already have clears it — the whole-star control's affordance, kept
    set(v === shown ? 0 : v)
  }

  return (
    <div
      ref={rootRef}
      role="slider"
      tabIndex={0}
      aria-label="Your rating"
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={shown}
      aria-valuetext={shown === 0 ? 'No rating' : label(shown)}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      className="flex cursor-pointer gap-0.5 outline-offset-2 focus-visible:outline focus-visible:outline-2"
      style={{ outlineColor: 'var(--accent)' }}
    >
      {[1, 2, 3, 4, 5].map(star)}
    </div>
  )
}
