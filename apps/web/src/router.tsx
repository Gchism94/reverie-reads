import { createRouter } from '@tanstack/react-router'
import { rootRoute } from './routes/RootRoute'
import { homeRoute } from './routes/HomeRoute'
import { libraryRoute } from './routes/LibraryRoute'
import { shelvesRoute } from './routes/ShelvesRoute'
import { plannerRoute } from './routes/PlannerRoute'
import { statsRoute } from './routes/StatsRoute'
import { matchRoute } from './routes/MatchRoute'
import { addRoute } from './routes/AddRoute'
import { settingsRoute } from './routes/SettingsRoute'
import { bookRoute } from './book/BookDetailRoute'

const routeTree = rootRoute.addChildren([
  homeRoute,
  libraryRoute,
  shelvesRoute,
  plannerRoute,
  statsRoute,
  matchRoute,
  addRoute,
  settingsRoute,
  bookRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
