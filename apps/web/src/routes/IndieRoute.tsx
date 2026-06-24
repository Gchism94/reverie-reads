import { createRoute, lazyRouteComponent } from '@tanstack/react-router'
import { rootRoute } from './RootRoute'

// Lazy so Leaflet (and the map vendor) only loads when someone actually opens /indie.
export const indieRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'indie',
  component: lazyRouteComponent(() => import('./IndieScreen')),
})
