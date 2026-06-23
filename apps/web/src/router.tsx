import { createRouter } from '@tanstack/react-router'
import { rootRoute } from './routes/RootRoute'
import { libraryRoute } from './routes/LibraryRoute'

const routeTree = rootRoute.addChildren([libraryRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
