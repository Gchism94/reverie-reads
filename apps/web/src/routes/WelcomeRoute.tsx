import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './RootRoute'
import { WelcomeScreen } from '../auth/WelcomeScreen'

/** Where Supabase email links land (confirm signup / password recovery). Rendered outside the
 *  auth gate — the visitor may or may not have a session yet; the screen handles both. */
export const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'welcome',
  component: WelcomeScreen,
})
