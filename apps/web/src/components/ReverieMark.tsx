/** The same open-book identity at the front door and inside every reading room. */
export function ReverieMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 28 26"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 22V6C11 3 6 3 2 4v16c4-1 9-1 12 2Zm0 0V6c3-3 8-3 12-2v16c-4-1-9-1-12 2Z" />
      <path
        d="M6 8c2-.1 3 .2 4 1M6 12c2-.1 3 .2 4 1M18 9c1-.8 2-1.1 4-1M18 13c1-.8 2-1.1 4-1"
        opacity=".55"
      />
    </svg>
  )
}
