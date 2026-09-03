import { useSkin } from '../skin/useSkin'
import { useSkinControls } from '../skin/controls'

/** Quick light/dark toggle. `compact` renders an icon-only button (sidebar / mobile bar);
 *  the default shows the mode label too. Skin selection lives in Settings (a separate axis). */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const resolved = useSkin((s) => s.resolvedMode)
  const { setMode } = useSkinControls()

  const isDark = resolved === 'dark'
  const label = isDark ? 'Dark' : 'Light'
  const icon = isDark ? '☾' : '☀'
  const ariaLabel = `Switch to ${isDark ? 'light' : 'dark'} mode (currently ${label.toLowerCase()})`

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setMode(isDark ? 'light' : 'dark')}
        title="Toggle light / dark"
        aria-label={ariaLabel}
        className="skin-control skin-btn-icon grid h-9 w-9 shrink-0 place-items-center text-[14px] backdrop-blur"
      >
        <span aria-hidden>{icon}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setMode(isDark ? 'light' : 'dark')}
      title="Toggle light / dark"
      aria-label={ariaLabel}
      className="skin-control skin-btn-secondary flex h-[38px] items-center gap-2 pl-3.5 pr-1.5 text-[12.5px] backdrop-blur"
    >
      <span>{label}</span>
      <span
        aria-hidden
        className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[13px]"
        style={{
          background: 'linear-gradient(135deg, var(--primary), var(--gold))',
          color: 'var(--on-primary)',
        }}
      >
        {icon}
      </span>
    </button>
  )
}
