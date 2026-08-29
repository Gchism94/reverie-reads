/** An accessible toggle switch (role="switch") — fills magenta→gold when on. */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-11 flex-none border border-line transition-colors disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
      style={{
        borderRadius: 'var(--radius-control)',
        background: checked
          ? 'linear-gradient(135deg, var(--primary), var(--gold))'
          : 'var(--field)',
      }}
    >
      <span
        className="absolute top-[2px] h-[18px] w-[18px] bg-white shadow transition-all motion-reduce:transition-none"
        style={{
          left: checked ? 'calc(100% - 20px)' : '2px',
          borderRadius: 'var(--radius-control)',
        }}
      />
    </button>
  )
}
