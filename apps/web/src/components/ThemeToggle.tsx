import { useSkin } from '../skin/useSkin'
import { useSkinControls } from '../skin/controls'

function ModeGlyph({ dark }: { dark: boolean }) {
  return dark ? (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path
        d="M19 15.2A7.6 7.6 0 0 1 8.8 5a7.5 7.5 0 1 0 10.2 10.2Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <circle cx="12" cy="12" r="3.75" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 2.75v2M12 19.25v2M21.25 12h-2M4.75 12h-2M18.54 5.46l-1.42 1.42M6.88 17.12l-1.42 1.42M18.54 18.54l-1.42-1.42M6.88 6.88 5.46 5.46"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Quick light/dark toggle. `compact` renders an icon-only button (sidebar / mobile bar);
 *  the default shows the mode label too. Skin selection lives in Settings (a separate axis). */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const resolved = useSkin((s) => s.resolvedMode)
  const { setMode } = useSkinControls()

  const isDark = resolved === 'dark'
  const label = isDark ? 'Dark' : 'Light'
  const ariaLabel = `Switch to ${isDark ? 'light' : 'dark'} mode (currently ${label.toLowerCase()})`

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setMode(isDark ? 'light' : 'dark')}
        title="Toggle light / dark"
        aria-label={ariaLabel}
        className="skin-control skin-btn-icon grid h-11 w-11 shrink-0 place-items-center backdrop-blur"
      >
        <ModeGlyph dark={isDark} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setMode(isDark ? 'light' : 'dark')}
      title="Toggle light / dark"
      aria-label={ariaLabel}
      className="skin-control skin-btn-secondary flex min-h-11 items-center gap-2 px-3.5 text-[13.5px] backdrop-blur"
    >
      <span>{label}</span>
      <span
        aria-hidden
        className="flex h-5 w-5 items-center justify-center"
        style={{ color: 'var(--accent-ink)' }}
      >
        <ModeGlyph dark={isDark} />
      </span>
    </button>
  )
}
