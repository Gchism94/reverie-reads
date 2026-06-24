import { createRouter } from '@tanstack/react-router'
import { rootRoute } from './routes/RootRoute'
import { libraryRoute } from './routes/LibraryRoute'
import { bookRoute } from './book/BookDetailRoute'

const routeTree = rootRoute.addChildren([libraryRoute, bookRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
