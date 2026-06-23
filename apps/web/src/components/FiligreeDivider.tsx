/** Thin wrought-iron filigree: gold hairline rules flanking a small star. */
export function FiligreeDivider({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`} aria-hidden>
      <span
        className="h-px flex-1"
        style={{ background: 'linear-gradient(90deg, transparent, var(--hair))' }}
      />
      <span className="text-[10px] tracking-[0.3em] text-gold">✦</span>
      <span
        className="h-px flex-1"
        style={{ background: 'linear-gradient(90deg, var(--hair), transparent)' }}
      />
    </div>
  )
}
