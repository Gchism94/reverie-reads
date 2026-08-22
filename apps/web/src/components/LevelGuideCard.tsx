/**
 * One level's definition, as a card — the ONLY place a level's meaning is presented.
 *
 * ── WHY THIS IS EXTRACTED RATHER THAN REUSING LevelPicker ───────────────────────────────────────
 * Book detail needs to explain a level; it must not become a place to CHANGE one. `LevelPicker` is
 * an input — its whole surface is five buttons wired to `onChange`, and the guide is a side effect
 * of pressing them. Rendering it read-only would mean adding a `readOnly` prop, which leaves the
 * write path one boolean away from a screen that has no business writing: a later refactor, a
 * default flipped, a prop forgotten, and book detail silently edits the book.
 *
 * Extracting the CARD instead means the read-only surface imports something that has no `onChange`
 * to forget. The picker keeps its behaviour and simply renders this for its guide; the detail page
 * renders it with no picker anywhere in the tree. Same copy, same component, no shared write path.
 *
 * The next person will reach for LevelPicker — that is why this paragraph is here.
 */
export function LevelGuideCard({
  level,
  definition,
  onDismiss,
  dismissLabel,
  id,
}: {
  /** The level being explained. Rendered as the numeral, so 0 is legitimate ("assessed as none"). */
  level: number
  definition: string
  /** Omitted on a surface with nothing to close — the detail page renders it dismissible, the
   *  picker only when a level is PINNED rather than merely hovered. */
  onDismiss?: () => void
  dismissLabel?: string
  id?: string
}) {
  return (
    <div
      id={id}
      role="status"
      className="skin-card mt-1 flex items-start gap-2 border border-line px-2.5 py-1.5 text-[12px] text-ink"
      style={{ background: 'var(--chip)' }}
    >
      <span className="skin-numeral flex-none font-semibold" style={{ color: 'var(--accent-ink)' }}>
        {level}
      </span>
      <span className="min-w-0 flex-1">{definition}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="flex-none text-muted"
        >
          ✕
        </button>
      )}
    </div>
  )
}
