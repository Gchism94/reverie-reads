import type { ReactNode } from 'react'
import { Link, useCanGoBack, useRouter } from '@tanstack/react-router'

/**
 * A back affordance that returns to the ORIGINATING route (real router history), falling back to
 * the logical parent when there's no history to go back to (deep link / fresh tab). Fixes the
 * "Back to library lands on home" class of bug — never hardcode a back destination again.
 */
export function BackLink({
  fallback,
  className,
  children,
}: {
  fallback: '/library' | '/clubs' | '/'
  className?: string
  children: ReactNode
}) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  if (!canGoBack) {
    return (
      <Link to={fallback} className={className}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" onClick={() => router.history.back()} className={className}>
      {children}
    </button>
  )
}
