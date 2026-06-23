import { useTheme } from '../theme/useTheme'

export function ThemeToggle() {
  const theme = useTheme((s) => s.theme)
  const toggleTheme = useTheme((s) => s.toggleTheme)

  const isNight = theme === 'nocturne'
  const label = isNight ? 'Nocturne' : 'Magnolia Dawn'
  const icon = isNight ? '☾' : '☀'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title="Toggle theme"
      aria-label={`Switch theme (currently ${label})`}
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
