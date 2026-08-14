import { Link } from '@tanstack/react-router'

/**
 * A mood chip — a READER-ASSIGNED impression, in a deliberately different visual register from the
 * structural trope chip (docs/archive/task-mood.md §3): a soft italic pill in the display face with a small
 * accent-ink dot, "felt" rather than catalogued. Assigned paints ink-on-card with an accent-ink
 * hairline (the contrast suite pins ink-on-card ≥ AA and the accent-ink accent ≥ 3:1 graphical);
 * unassigned sits quiet in muted-on-field. Never the loud accent-fill the trope PINS use.
 */
export function MoodChip({
  name,
  active = true,
  onClick,
  to,
  title,
}: {
  name: string
  /** assigned (the reader felt this) vs an unpicked option in a picker */
  active?: boolean
  onClick?: () => void
  /** link form (mood pages); mutually exclusive with onClick */
  to?: string
  title?: string
}) {
  const className =
    'skin-control-quiet inline-flex items-center gap-1.5 border px-3 py-1.5 text-[12.5px] italic'
  const style = active
    ? {
        background: 'var(--card)',
        color: 'var(--ink)',
        borderColor: 'var(--accent-ink)',
        fontFamily: 'var(--font-display)',
      }
    : {
        background: 'var(--field)',
        color: 'var(--muted)',
        borderColor: 'var(--line)',
        fontFamily: 'var(--font-display)',
      }
  const body = (
    <>
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 flex-none rounded-full"
        style={{ background: active ? 'var(--accent-ink)' : 'var(--muted)' }}
      />
      {name}
    </>
  )
  if (to)
    return (
      <Link to={to} className={className} style={style} title={title ?? name} aria-label={name}>
        {body}
      </Link>
    )
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${name}${active ? ' (assigned)' : ''}`}
      className={className}
      style={style}
      title={title ?? name}
    >
      {body}
    </button>
  )
}
