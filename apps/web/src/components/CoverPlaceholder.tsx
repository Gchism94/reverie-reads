import { placeholderSpec } from '@reverie/core'

/**
 * Cover Studio pillar #3: a skin-themed typographic placeholder for a cover-less book. Pure tokens —
 * the accent + display font come from the active skin's CSS variables, so it re-themes for free and is
 * always on-brand (no hardcoded colours). The accent is chosen deterministically per book in core.
 */
export function CoverPlaceholder({
  book,
  className,
}: {
  book: { title?: string; first?: string; last?: string }
  className?: string
}) {
  const { title, author, initials, accentVar } = placeholderSpec(book)
  const label = `${title || 'Untitled'}${author ? ` by ${author}` : ''} — placeholder cover`
  return (
    <div
      role="img"
      aria-label={label}
      className={className}
      style={{
        aspectRatio: '2 / 3',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 10,
        border: '1px solid var(--line)',
        background: 'var(--card)',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'grid',
          placeItems: 'center',
          background: `color-mix(in srgb, var(${accentVar}) 16%, var(--card))`,
        }}
      >
        <span
          aria-hidden
          style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '2rem', fontWeight: 600, color: `var(${accentVar})` }}
        >
          {initials}
        </span>
      </div>
      <div style={{ padding: '8px 9px 10px' }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 12.5,
            lineHeight: 1.15,
            color: 'var(--ink)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {title || 'Untitled'}
        </div>
        {author && (
          <div style={{ marginTop: 2, fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {author}
          </div>
        )}
      </div>
    </div>
  )
}
