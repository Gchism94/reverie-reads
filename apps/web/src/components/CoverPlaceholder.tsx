import { placeholderColorVars, placeholderSpec } from '@reverie/core'

/**
 * Cover Studio pillar #3: a skin-themed typographic placeholder for a cover-less book. FILLS its
 * parent (the caller provides the sized, bordered, overflow-hidden box — matching the app's cover
 * idiom), so it drops in anywhere a cover renders, from a tiny rail thumb to the detail hero. A
 * centered monogram on an accent-tinted card — pure tokens (accent chosen deterministically per book
 * in core, font from var(--font-display)), so it re-themes for free and is always on-brand. The title
 * is shown by the surrounding UI, so the placeholder stays clean at every size.
 */
export function CoverPlaceholder({
  book,
  className,
}: {
  book: { title?: string; first?: string; last?: string }
  className?: string
}) {
  const { title, author, initials, accentVar } = placeholderSpec(book)
  // Contrast-safe by construction (≥ AA at every skin × mode): flavour in the accent-tinted opaque
  // surface, glyph anchored to --ink. Recipe + guardrail test live in @reverie/core.
  const colors = placeholderColorVars(accentVar)
  return (
    <div
      role="img"
      aria-label={`${title || 'Untitled'}${author ? ` by ${author}` : ''} — placeholder cover`}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        background: colors.background,
      }}
    >
      <span
        aria-hidden
        style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 600, fontSize: '1.6rem', color: colors.color }}
      >
        {initials}
      </span>
    </div>
  )
}
