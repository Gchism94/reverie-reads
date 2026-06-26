import { Link } from '@tanstack/react-router'
import { SKINS } from '@reverie/core'
import { useProfile } from '../data/profile'
import { useAdaptiveControls } from '../skin/controls'

/**
 * The monthly "your profile is evolving" reveal. Shown when the cron has written a pending
 * adaptive suggestion; lets the reader keep it, dismiss it, or lock their skin. Scaffolded against
 * the spec — slot the Claude Design visual here when it lands. Resolving clears the pending.
 */
export function SkinEvolveReveal() {
  const { data: profile } = useProfile()
  const { acceptPending, dismissPending, lockPending } = useAdaptiveControls()
  const pending = profile?.adaptivePending
  if (!pending) return null

  return (
    <div
      role="status"
      className="mx-auto mt-3 flex max-w-3xl flex-col gap-2 rounded-2xl border border-line px-4 py-3 sm:flex-row sm:items-center"
      style={{ background: 'var(--card)', boxShadow: 'var(--shadow)' }}
    >
      <div className="flex-1 text-[13.5px] text-ink">
        <span className="font-semibold">✦ Your reading profile is evolving.</span>{' '}
        Lately you’re {pending.insight} — echoing {SKINS[pending.dominant].label}. Refresh your
        adaptive skin to match?
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => acceptPending(pending)}
          className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold"
          style={{ background: 'var(--accent-fill)', color: 'var(--on-primary)' }}
        >
          Refresh my skin
        </button>
        <Link to="/skins" className="rounded-full border border-line px-4 py-1.5 text-[12.5px] font-semibold text-ink" style={{ background: 'var(--field)' }}>
          Preview
        </Link>
        <button
          type="button"
          onClick={() => dismissPending(pending)}
          className="rounded-full border border-line px-4 py-1.5 text-[12.5px] font-semibold text-muted"
          style={{ background: 'var(--field)' }}
        >
          Not now
        </button>
        <button
          type="button"
          onClick={() => lockPending()}
          className="rounded-full border border-line px-4 py-1.5 text-[12.5px] font-semibold text-muted"
          style={{ background: 'var(--field)' }}
        >
          Lock my skin
        </button>
      </div>
    </div>
  )
}
