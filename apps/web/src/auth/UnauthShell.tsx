import { useRouterState } from '@tanstack/react-router'
import { Landing } from './Landing'
import { AuthScreen } from './AuthScreen'

/** The unauthenticated front door, scoped to the gold master brand (which paints its own night sky).
 *  Routes by path: /auth → the auth screen, anything else → the public landing. App routes aren't
 *  reachable while signed out — the root layout renders this in place of the app outlet. */
export function UnauthShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return <div className="gold-brand">{pathname.startsWith('/auth') ? <AuthScreen /> : <Landing />}</div>
}
