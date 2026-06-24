/** An accessible toggle switch (role="switch") — fills magenta→gold when on. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-11 flex-none rounded-full border border-line transition-colors"
      style={{
        background: checked ? 'linear-gradient(135deg, var(--primary), var(--gold))' : 'var(--field)',
      }}
    >
      <span
        className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all"
        style={{ left: checked ? 'calc(100% - 20px)' : '2px' }}
      />
    </button>
  )
}
