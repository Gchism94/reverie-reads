import { useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { Landing } from './Landing'
import { AuthScreen } from './AuthScreen'
import { takeLocalSignOutNotice } from '../lib/offlineSignOut'

/** The unauthenticated front door, scoped to the gold master brand (which paints its own night sky).
 *  Routes by path: /auth → the auth screen, anything else → the public landing. App routes aren't
 *  reachable while signed out — the root layout renders this in place of the app outlet. */
export function UnauthShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // Read once on mount, and it clears itself — a sign-out that only reached this device says so.
  const [localOnly] = useState(takeLocalSignOutNotice)
  return (
    <div className="gold-brand">
      {/* Held to the copy standard: it must not imply the reader is signed out anywhere but here.
          They were offline, so the server was never told; other devices are untouched. */}
      {localOnly && (
        <p role="status" className="px-6 py-3 text-center text-[13px]" style={{ background: 'var(--card)', color: 'var(--muted)' }}>
          Signed out on this device. You were offline, so any other devices stay signed in.
        </p>
      )}
      {pathname.startsWith('/auth') ? <AuthScreen /> : <Landing />}
    </div>
  )
}
