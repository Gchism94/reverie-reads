import { APP_NAME } from '@reverie/core'

/** A quiet open-book mark belongs to every kind of reader; individual rooms keep their motifs. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ''}`}>
      <svg
        aria-hidden="true"
        viewBox="0 0 28 26"
        className="h-7 w-7 shrink-0"
        fill="none"
        stroke="var(--gold)"
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
      <span
        className="text-[24px] leading-[1.2] text-ink"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-.3px' }}
      >
        {APP_NAME}
      </span>
    </span>
  )
}
