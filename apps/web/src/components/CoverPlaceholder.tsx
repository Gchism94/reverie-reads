import { placeholderColorVars, placeholderSpec } from '@reverie/core'

/**
 * Cover Studio pillar #3: a skin-themed typographic placeholder for a cover-less book — the DESIGNED
 * treatment, a title/author plate (the "Crimson Letters · D. Marchand" cover), not a bare monogram.
 * FILLS its parent (the caller provides the sized/bordered/overflow-hidden box), so it drops in
 * anywhere a cover renders, from a reading-now thumb to the detail hero; the text scales to the box
 * via container units so it stays clean at every size. Pure tokens — accent chosen deterministically
 * per book, display font + colours from the active skin — so it re-themes for free and is always
 * on-brand. Contrast-safe by construction (≥ AA at every skin × mode): the text sits in the same
 * ink-anchored accent colour the monogram used, on the same accent-tinted OPAQUE `--card-solid`
 * surface (recipe + guardrail test in @reverie/core), so the title/author inherit that AA proof.
 */
export function CoverPlaceholder({
  book,
  className,
}: {
  book: { title?: string; first?: string; last?: string }
  className?: string
}) {
  const { title, author, accentVar } = placeholderSpec(book)
  const colors = placeholderColorVars(accentVar)
  return (
    <div
      role="img"
      aria-label={`${title || 'Untitled'}${author ? ` by ${author}` : ''} — placeholder cover`}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '6%',
        padding: '9% 11%',
        overflow: 'hidden',
        background: colors.background,
        containerType: 'inline-size', // so the type scales to the cover box (thumb → hero)
      }}
    >
      <span aria-hidden className="block flex-none" style={{ height: 2, width: '34%', background: colors.color, opacity: 0.55 }} />
      <span
        aria-hidden
        style={{
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontWeight: 600,
          fontSize: 'clamp(11px, 15cqw, 22px)',
          lineHeight: 1.06,
          color: colors.color,
          display: '-webkit-box',
          WebkitLineClamp: 4,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {title || 'Untitled'}
      </span>
      {author && (
        <span
          aria-hidden
          className="skin-label"
          style={{
            fontSize: 'clamp(8px, 8cqw, 11px)',
            letterSpacing: '0.08em',
            color: colors.color,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {author}
        </span>
      )}
    </div>
  )
}
