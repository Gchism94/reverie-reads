// First import on purpose: captures the auth-callback hash (email confirm / recovery) before
// supabase-js strips it from the URL.
import './lib/authCallback'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { APP_NAME } from '@reverie/core'
import { AuthProvider } from './auth/AuthProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initErrorMonitoring } from './lib/sentry'
import { BUILD_ID, installPreloadErrorReload } from './lib/updates'
import { createDexiePersister } from './lib/offlineCache'
import { router } from './router'
import './styles/tokens.css'
import './styles/globals.css'
import './styles/brand.css'
import './styles/skin-kit.css'

document.title = APP_NAME
initErrorMonitoring()
installPreloadErrorReload()

// Offline app shell + installability (public/sw.js). Prod only — a SW in dev serves stale
// modules and fights Vite's HMR. Registration failing is fine; the app works without it.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // The build id in the script URL makes the browser re-check the worker on every deploy, so a new
    // build reliably triggers the SW `updatefound` signal the update watch listens for.
    void navigator.serviceWorker.register(`/sw.js?v=${BUILD_ID}`).catch(() => {})
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
        // buster = the build id: every deploy discards the persisted query cache on load, so a
        // client that updates after a DB migration can never restore a stale query SHAPE (the
        // motivating failure). Ties cache lifetime to the deploy, automatically — no manual bump.
        persistOptions={{ persister, maxAge: WEEK, buster: BUILD_ID }}
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
