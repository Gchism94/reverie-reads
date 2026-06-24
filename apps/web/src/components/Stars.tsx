/** Five-star rating. Interactive when `onChange` is given (click a set star to clear). */
export function Stars({
  value,
  onChange,
  size = 20,
}: {
  value: number
  onChange?: (v: number) => void
  size?: number
}) {
  const color = (i: number) => (i <= Math.round(value) ? 'var(--gold)' : 'var(--chip-border)')
  if (!onChange) {
    return (
      <div className="flex gap-0.5" aria-label={`Rated ${value} of 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} aria-hidden style={{ fontSize: size, color: color(i) }}>
            ★
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className="flex gap-0.5" role="group" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(value === i ? 0 : i)}
          aria-label={`${i} star${i > 1 ? 's' : ''}`}
          aria-pressed={i <= Math.round(value)}
          className="leading-none"
          style={{ fontSize: size, color: color(i) }}
        >
          ★
        </button>
      ))}
    </div>
  )
}
