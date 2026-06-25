import { useSkin } from '../skin/useSkin'
import { useSkinControls } from '../skin/controls'

/** Quick light/dark toggle in the top bar. Skin selection lives in Settings (a separate axis). */
export function ThemeToggle() {
  const resolved = useSkin((s) => s.resolvedMode)
  const { setMode } = useSkinControls()

  const isDark = resolved === 'dark'
  const label = isDark ? 'Dark' : 'Light'
  const icon = isDark ? '☾' : '☀'

  return (
    <button
      type="button"
      onClick={() => setMode(isDark ? 'light' : 'dark')}
      title="Toggle light / dark"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode (currently ${label.toLowerCase()})`}
      className="flex h-[38px] items-center gap-2 rounded-full border border-line bg-card pl-3.5 pr-1.5 text-[12.5px] font-semibold text-ink backdrop-blur"
    >
      <span>{label}</span>
      <span
        aria-hidden
        className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[13px]"
        style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
      >
        {icon}
      </span>
    </button>
  )
}
