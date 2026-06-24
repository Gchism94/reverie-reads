import { useState } from 'react'
import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './RootRoute'
import {
  geocodePlace,
  loadLocation,
  requestGeolocation,
  reverseGeocode,
  saveLocation,
  type ResolvedLocation,
} from '../lib/location'

function IndieScreen() {
  const [loc, setLoc] = useState<ResolvedLocation | null>(() => loadLocation())
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apply = (resolved: ResolvedLocation) => {
    setLoc(resolved)
    saveLocation(resolved)
  }

  async function detectLocation() {
    setBusy(true)
    setError(null)
    const pos = await requestGeolocation()
    if (!pos) {
      setBusy(false)
      setError('Location access was declined or unavailable — enter a ZIP or city below.')
      return
    }
    apply({ ...pos, label: await reverseGeocode(pos.lat, pos.lng) })
    setBusy(false)
  }

  async function findByQuery() {
    if (!query.trim()) return
    setBusy(true)
    setError(null)
    const resolved = await geocodePlace(query)
    setBusy(false)
    if (!resolved) {
      setError('Couldn’t find that place — try a ZIP code or “City, State”.')
      return
    }
    apply(resolved)
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1
        className="text-[22px] italic text-ink"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
      >
        Indie bookstores near you
      </h1>
      <div
        className="mt-3 rounded-xl border border-line p-3 text-[13px] text-muted"
        style={{ background: 'var(--card)' }}
      >
        📚 Discover &amp; support independent bookstores. This is discovery and support — not live
        inventory; we won’t promise “in stock near you.”
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void detectLocation()}
          disabled={busy}
          className="h-11 rounded-full px-5 text-[14px] font-semibold disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
        >
          📍 Use my location
        </button>
        <span className="text-[12.5px] text-muted">or</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void findByQuery()
          }}
          placeholder="ZIP code or city"
          aria-label="ZIP code or city"
          className="h-11 min-w-[160px] flex-1 rounded-full border border-line px-4 text-[14px] text-ink outline-none"
          style={{ background: 'var(--field)' }}
        />
        <button
          type="button"
          onClick={() => void findByQuery()}
          disabled={busy || !query.trim()}
          className="h-11 rounded-full border border-line px-5 text-[14px] font-semibold text-ink disabled:opacity-50"
          style={{ background: 'var(--card)' }}
        >
          Find
        </button>
      </div>

      {error && <p className="mt-3 text-[13px] text-primary">{error}</p>}

      {loc ? (
        <p className="mt-4 text-[13.5px] text-ink">
          Searching near <span className="font-semibold">{loc.label}</span>{' '}
          <button
            type="button"
            onClick={() => {
              setLoc(null)
              saveLocation(null)
            }}
            className="text-[12.5px] text-primary"
          >
            change
          </button>
        </p>
      ) : (
        <p className="mt-6 rounded-2xl border border-line p-6 text-center text-[14px] text-muted">
          Set a location to find nearby independent bookstores.
        </p>
      )}

      {/* Nearby store map + list arrives in B2; buy links in B3. */}
    </section>
  )
}

export const indieRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'indie',
  component: IndieScreen,
})
