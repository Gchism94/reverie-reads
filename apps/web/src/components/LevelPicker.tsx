import { useEffect, useRef, useState } from 'react'
import { LevelGuideCard } from './LevelGuideCard'
import { rememberGuideDismissed, useGuideDismissed } from './levelGuideDismissed'

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
  const dismissed = useGuideDismissed()
  const rootRef = useRef<HTMLDivElement>(null)

  /** Every dismissal path goes through here — ✕, Escape, outside click, re-click — because the
   *  reader who closed it meant the same thing each way. Forking behaviour by which route was used
   *  would make the guide's future depend on a detail nobody tracks. */
  const dismiss = () => {
    setPinned(null)
    rememberGuideDismissed()
  }

  // A pin outlives the pointer, so it needs the two dismissals a transient preview does not:
  // Escape from anywhere, and a click that lands outside this picker. Both are Modal's contract.
  useEffect(() => {
    if (pinned === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    const onDown = (e: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) dismiss()
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
              // Setting the level ALWAYS works; only the guide is suppressed. Once dismissed, this
              // is the plain picker it was before the guide existed.
              onChange(value === i ? 0 : i)
              // GATE ON THE GUIDE BEING CLOSED, NOT ON THE FLAG ALONE.
              //
              // `if (dismissed) return` was wrong because the "What do the levels mean?" button
              // below is deliberately NOT gated on the flag: a dismissed reader can still open the
              // guide from it. Returning here on the flag alone meant that once open, no tap could
              // move the guide — `onChange` still fired, so the VALUE changed underneath a panel
              // frozen on whichever level opened it. The guide then described a level the reader
              // was no longer on, which is worse than not showing it at all.
              //
              // `pinned === null` is "the guide is closed". Closed + dismissed is the plain picker
              // the dismissal asked for, so it still returns early. OPEN means the reader asked to
              // see it just now, and it must track them until they close it again.
              if (pinned === null && dismissed) return
              // Re-clicking the PINNED level closes it, and closing is closing — it goes through
              // `dismiss` like every other route. Treating it as a mere toggle was the bug: the
              // guide shut, the flag never set, and the next tap popped it straight back.
              if (pinned === i) dismiss()
              else setPinned(i)
            }}
            // Mouse only: a synthesised touch "hover" would fight the tap that follows it.
            onPointerEnter={(e) => e.pointerType === 'mouse' && !dismissed && setPreviewed(i)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setPreviewed(null)}
            onFocus={() => !dismissed && setPreviewed(i)}
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
      {/* THE CARD IS THE ONLY PRESENTATION. A resting <p> used to show `levels[value]` whenever the
          card was closed — the same fact, said twice, in two places, in two styles. One of them had
          to go, and the card is the one that can explain a level the reader is not currently on.

          CONSEQUENCE, stated because it is a real trade and not an oversight: a reader who has
          dismissed the guide now has NO inline level text at all. "What do the levels mean?" below
          is the only route back, which is exactly why that link is never gated on the dismissal
          flag — it is load-bearing now, not a convenience. */}
      {shown !== null && (
        <LevelGuideCard
          id={guideId}
          level={shown}
          definition={levels[shown] ?? ''}
          onDismiss={pinned !== null ? dismiss : undefined}
          dismissLabel={`Close the ${label} level guide`}
        />
      )}

      {/* THE PERMANENT WAY BACK. Always present, never gated on the dismissal flag — a reader who
          turned the guide off and later wants it has one obvious control rather than a settings
          hunt, and a reader who never dismissed it loses nothing by its being there. A real
          <button>, so it is focusable and Enter/Space work; opening from here does NOT clear the
          flag, because asking once is not the same as asking always. */}
      <button
        type="button"
        onClick={() => setPinned(value || 0)}
        className="mt-1 text-[11px] underline underline-offset-2"
        style={{ color: 'var(--accent-ink)' }}
      >
        What do the levels mean?
      </button>
    </div>
  )
}
