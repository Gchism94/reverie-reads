import { APP_NAME } from '@reverie/core'
import { ReverieMark } from '../components/ReverieMark'

/** A quiet open-book mark belongs to every kind of reader; individual rooms keep their motifs. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ''}`}>
      <ReverieMark className="h-7 w-7 text-[color:var(--gold)]" />
      <span
        className="text-[24px] leading-[1.2] text-ink"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-.3px' }}
      >
        {APP_NAME}
      </span>
    </span>
  )
}
