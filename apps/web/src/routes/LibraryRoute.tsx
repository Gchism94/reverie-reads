import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './RootRoute'

// First vertical slice lands here in Step 5 (cover grid, filters, Grid ⇄ Series).
// For the scaffold this is the library's empty state — inviting, in the app's voice.
function LibraryScreen() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-[13px] uppercase tracking-[0.3em] text-muted">Your library</p>
      <h1
        className="mt-3 max-w-[16ch] text-balance text-[40px] italic leading-[1.05] text-ink"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
      >
        Everything you’ve read, after dark
      </h1>
      <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-muted">
        Mark a book “Reading” and your home comes alive — spice, tropes, series gaps and
        rereads, all in one place.
      </p>
      <button
        type="button"
        className="mt-8 rounded-full px-6 py-3 text-[14px] font-semibold"
        style={{
          background: 'linear-gradient(135deg, var(--primary), var(--gold))',
          color: 'var(--on-primary)',
          boxShadow: 'var(--shadow)',
        }}
      >
        Add your first book
      </button>
    </section>
  )
}

export const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LibraryScreen,
})
