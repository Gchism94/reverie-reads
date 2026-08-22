import { useEffect, useRef, useState } from 'react'

/**
 * A five-glyph 0–5 picker with a per-level guide — Spice and Darkness, one implementation.
 *
 * ── WHY THIS IS A COMPONENT AND NOT A FIFTH COPY ────────────────────────────────────────────────
 * dialogs.tsx and AddRoute.tsx carried FOUR byte-identical copies of this JSX (two pickers × two
 * files). This is the second feature in a row that has to touch all four in lockstep, which is the
 * point at which hand-duplication stops being cheaper. Extracting is less code than adding the
 * popover four times, and it retires the drift risk the duplication already carried.
 *
 * ── THE TENSION THE GUIDE HAS TO RESOLVE ────────────────────────────────────────────────────────
 * #330 put the selected level's definition in a line under the row, which cannot answer "what does
 * 4 mean" unless you first SET 4 — and setting it to look is exactly what a reader comparing levels
 * must not have to do. So the guide has to be reachable WITHOUT committing:
 *
 *   · fine pointer — hovering a glyph previews that level. Nothing commits.
 *   · keyboard — focusing a glyph (Tab, or arrowing along the row) previews it. Nothing commits.
 *   · click / tap — sets the level as it always did AND pins that level's guide open.
 *
 * Pinning is what makes this usable on touch, where there is no hover to preview with: a tap shows
 * the definition and it STAYS until dismissed, rather than vanishing with the finger. Stated
 * plainly because it is the one place this design is weaker on touch than on desktop — a touch
 * reader still cannot read level 4's meaning without momentarily setting 4. One more tap restores
 * their value, and the alternative (first tap previews, second commits) is a hidden mode with no
 * affordance, which is worse.
 *
 * Dismissal follows Modal's established conventions rather than inventing new ones: Escape closes,
 * an outside click closes, and re-clicking the pinned level closes it. There is also a labelled
 * close control, because "click outside" is not discoverable and is not reachable by keyboard.
 */
export function LevelPicker({
  label,
  glyph,
  levels,
  value,
  onChange,
  name,
}: {
  label: string
  glyph: string
  /** index 0..5 — index 0 is the "none" definition, shown at rest when nothing is set */
  levels: readonly string[]
  value: number
  onChange: (v: number) => void
  /** stable id fragment so two pickers on one screen own distinct aria targets */
  name: string
}) {
  const [pinned, setPinned] = useState<number | null>(null)
  const [previewed, setPreviewed] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // A pin outlives the pointer, so it needs the two dismissals a transient preview does not:
  // Escape from anywhere, and a click that lands outside this picker. Both are Modal's contract.
  useEffect(() => {
    if (pinned === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(null)
    }
    const onDown = (e: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPinned(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [pinned])

  // The pin wins over a transient hover, so moving the mouse away from a pinned level does not
  // silently swap the text the reader is mid-sentence through.
  const shown = pinned ?? previewed
  const guideId = `level-guide-${name}`

  return (
    <div className="mt-3" ref={rootRef}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.15em] text-muted">{label}</span>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              onChange(value === i ? 0 : i)
              setPinned(pinned === i ? null : i)
            }}
            // Mouse only: a synthesised touch "hover" would fight the tap that follows it.
            onPointerEnter={(e) => e.pointerType === 'mouse' && setPreviewed(i)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setPreviewed(null)}
            onFocus={() => setPreviewed(i)}
            onBlur={() => setPreviewed(null)}
            aria-label={`${label} ${i} — ${levels[i]}`}
            aria-pressed={i <= value}
            aria-describedby={shown === i ? guideId : undefined}
            aria-expanded={pinned === i}
            className="grid h-6 w-6 place-items-center rounded-full border text-[13px] leading-none"
            style={{
              // THE RING CARRIES THE STATE — the glyph no longer does, and that is the fix.
              //
              // These levels encoded selection as `opacity: i <= value ? 1 : 0.3`, which fails
              // WCAG 1.4.11's 3:1 for non-text contrast in ALL EIGHTEEN skin x mode combinations
              // (measured 1.08–1.38:1). Opacity crushes any glyph toward its own background by
              // construction, so no choice of glyph could have rescued it — and the darkness moon
              // (U+1F311 NEW MOON, near-black) additionally failed SELECTED in 8 of 9 dark skins,
              // 1.32–1.60:1. Named by codepoint, not pasted: this component is glyph-AGNOSTIC — it
              // renders whatever `glyph` prop it is handed — and glyphAllowlist.test.ts rightly
              // refuses an undeclared symbol here, comment or not.
              //
              // --muted is the one token measured to clear 3:1 against the card in every
              // combination (4.51:1 worst, bloom/dark 8.25:1 best). Ring present = this control
              // exists; ring FILLED = this level is set. Both readings are the same muted-vs-card
              // pair, so one assertion covers presence and state together —
              // levelRing.contrast.test.ts, registry-keyed over all nine skins.
              //
              // --accent-fill is deliberately NOT load-bearing here. It measures 1.00:1 against
              // the card in almanac/dark — literally the same colour — and under 3:1 in three more
              // dark skins, so anything that depended on it would be invisible in four skins. It
              // may be layered back as decoration later; nothing may rely on it.
              borderColor: 'var(--muted)',
              background: i <= value ? 'var(--muted)' : 'transparent',
            }}
          >
            {glyph}
          </button>
        ))}
      </div>

      {/* Anchored, not portaled. A per-level micro-guide inside an existing dialog does not want
          Modal's focus trap or backdrop — those exist to take over the screen, and taking the
          screen over to define one word would be worse than the problem. It stays in flow so it
          cannot cover the row that spawned it, and so it reflows on a narrow viewport for free. */}
      {shown !== null ? (
        <div
          id={guideId}
          role="status"
          className="skin-card mt-1 flex items-start gap-2 border border-line px-2.5 py-1.5 text-[12px] text-ink"
          style={{ background: 'var(--chip)' }}
        >
          <span
            className="skin-numeral flex-none font-semibold"
            style={{ color: 'var(--accent-ink)' }}
          >
            {shown}
          </span>
          <span className="min-w-0 flex-1">{levels[shown]}</span>
          {pinned !== null && (
            <button
              type="button"
              onClick={() => setPinned(null)}
              aria-label={`Close the ${label} level guide`}
              className="flex-none text-muted"
            >
              ✕
            </button>
          )}
        </div>
      ) : (
        // At rest: the selected level's definition, which is what #330 added and what a reader
        // wants when they are not exploring. levels[0] covers "nothing set".
        <p className="mt-1 text-[12px] text-muted">{levels[value] ?? ''}</p>
      )}
    </div>
  )
}
