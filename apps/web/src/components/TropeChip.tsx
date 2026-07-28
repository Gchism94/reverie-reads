import { Link } from '@tanstack/react-router'
import type { ChipEmphasis } from '@reverie/core'
import { BookmarkGlyph } from './BookmarkGlyph'

/**
 * A trope chip through the skin character system — control radius, kit surfaces, and the skin's
 * bookmark ornament for PINNED (larger presence, accent fill; the same treatment the shelves use
 * for priority). Never a generic gray pill. Both states ride token pairs the contrast suite pins.
 */
export function TropeChip({
  name,
  emphasis = 'present',
  onClick,
  to,
  title,
}: {
  name: string
  emphasis?: ChipEmphasis
  onClick?: () => void
  /** link form (trope pages); mutually exclusive with onClick */
  to?: string
  title?: string
}) {
  const pinned = emphasis === 'pinned'
  const off = emphasis === 'off'
  const className = `skin-control inline-flex items-center gap-1.5 border font-semibold ${
    pinned ? 'px-3.5 py-2 text-[13px]' : 'px-3 py-1.5 text-[12.5px]'
  }`
  const style = pinned
    ? { background: 'var(--accent-fill)', color: 'var(--on-primary)', borderColor: 'transparent' }
    : off
      ? { background: 'var(--field)', color: 'var(--muted)', borderColor: 'var(--line)' }
      : { background: 'var(--chip)', color: 'var(--ink)', borderColor: 'var(--line)' }
  const body = (
    <>
      {pinned && (
        <span aria-hidden>
          <BookmarkGlyph size={11} />
        </span>
      )}
      {name}
    </>
  )
  if (to)
    return (
      <Link
        to={to}
        className={className}
        style={style}
        title={title ?? name}
        aria-label={`${name}${pinned ? ' (pinned)' : ''}`}
      >
        {body}
      </Link>
    )
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!off}
      aria-label={`${name}${pinned ? ' (pinned)' : off ? '' : ' (tagged)'}`}
      className={className}
      style={style}
      title={title ?? name}
    >
      {body}
    </button>
  )
}
