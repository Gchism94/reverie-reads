import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { APP_NAME } from '@reverie/core'
import { AuthProvider } from './auth/AuthProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initErrorMonitoring } from './lib/sentry'
import { createDexiePersister } from './lib/offlineCache'
import { router } from './router'
import './styles/tokens.css'
import './styles/globals.css'
import './styles/brand.css'
import './styles/skin-kit.css'

document.title = APP_NAME
initErrorMonitoring()

// Offline app shell + installability (public/sw.js). Prod only — a SW in dev serves stale
// modules and fights Vite's HMR. Registration failing is fine; the app works without it.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

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
