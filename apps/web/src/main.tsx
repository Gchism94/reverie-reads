import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { APP_NAME } from '@reverie/core'
import { AuthProvider } from './auth/AuthProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initObservability } from './lib/observability'
import { createDexiePersister } from './lib/offlineCache'
import { router } from './router'
import './styles/tokens.css'
import './styles/globals.css'

document.title = APP_NAME
initObservability()

const WEEK = 1000 * 60 * 60 * 24 * 7

// gcTime must outlast maxAge so cached queries survive to be persisted/restored offline.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { gcTime: WEEK, staleTime: 1000 * 30, retry: 1, refetchOnWindowFocus: false },
  },
})

const persister = createDexiePersister()

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, maxAge: WEEK, buster: 'v1' }}
        onSuccess={() => {
          // Flush any writes that were queued while offline.
          void queryClient.resumePausedMutations()
        }}
      >
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
