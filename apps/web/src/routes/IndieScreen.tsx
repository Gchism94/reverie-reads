import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useSkin } from '../skin/useSkin'
import { useProfile, useUpdateProfile } from '../data/profile'
import {
  geocodePlace,
  loadLocation,
  requestGeolocation,
  reverseGeocode,
  saveLocation,
  type ResolvedLocation,
} from '../lib/location'
import { findBookstores, type Store } from '../lib/overpass'

const miles = (km: number) => `${(km * 0.621371).toFixed(1)} mi`

// Map tiles are served from CARTO's CDN (dark for Nocturne, light for Magnolia Dawn) — the
// policy-respecting path for tiles (a CDN, not our origin). The throttled API calls (Overpass +
// Nominatim) are proxied + cached through the `geo` Edge Function; tiles stay on the CDN. Owner
// action at production volume: a tile plan / self-hosted tiles (free CARTO basemaps are light-use).
const TILES = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
}
const TILE_ATTR = '&copy; OpenStreetMap contributors &copy; CARTO'

function StoreMap({ loc, stores }: { loc: ResolvedLocation; stores: Store[] }) {
  const mode = useSkin((s) => s.resolvedMode)
  return (
    <div role="region" aria-label="Map of nearby independent bookstores" className="h-80 overflow-hidden rounded-2xl border border-line">
      <MapContainer key={`${loc.lat},${loc.lng}`} center={[loc.lat, loc.lng]} zoom={12} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer key={mode} url={TILES[mode]} attribution={TILE_ATTR} />
        <CircleMarker center={[loc.lat, loc.lng]} radius={7} pathOptions={{ color: '#f0b14e', fillColor: '#f0b14e', fillOpacity: 0.9 }}>
          <Popup>You are here</Popup>
        </CircleMarker>
        {stores.map((s) => (
          <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={6} pathOptions={{ color: '#cf2f66', fillColor: '#cf2f66', fillOpacity: 0.85 }}>
            <Popup>
              <b>{s.name}</b>
              {s.address ? <div>{s.address}</div> : null}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}

/** Never dead-end: when there's no nearby data (no results, non-US gap, or an Overpass hiccup),
 *  point to the indies' online storefronts. Consistent with the no-live-inventory banner. */
function ShopOnlineFallback() {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <a href="https://bookshop.org" target="_blank" rel="noreferrer" className="rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-ink" style={{ background: 'var(--field)' }}>
        Print &amp; ebooks · Bookshop.org ↗
      </a>
      <a href="https://libro.fm" target="_blank" rel="noreferrer" className="rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-ink" style={{ background: 'var(--field)' }}>
        Audiobooks · Libro.fm ↗
      </a>
    </div>
  )
}

function StoreList({
  stores,
  defaultId,
  onSetDefault,
}: {
  stores: Store[]
  defaultId: string | null
  onSetDefault: (s: Store | null) => void
}) {
  return (
    <ul className="mt-4 flex flex-col gap-2">
      {stores.map((s) => {
        const isDefault = s.id === defaultId
        return (
          <li key={s.id} className="rounded-2xl border border-line p-3" style={{ background: 'var(--card)' }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[15px] font-semibold text-ink">
                {isDefault && <span title="Your store">✓ </span>}
                {s.name}
              </span>
              <span className="flex-none text-[12px] text-muted">{miles(s.distanceKm)}</span>
            </div>
            {s.address && <div className="mt-0.5 text-[13px] text-muted">{s.address}</div>}
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
              {s.hours && <span className="text-muted">🕑 {s.hours}</span>}
              {s.phone && (
                <a href={`tel:${s.phone}`} className="text-primary">
                  {s.phone}
                </a>
              )}
              {s.website && (
                <a href={s.website} target="_blank" rel="noreferrer" className="text-primary">
                  Website ↗
                </a>
              )}
              <button
                type="button"
                onClick={() => onSetDefault(isDefault ? null : s)}
                className="ml-auto rounded-full border border-line px-2.5 py-1 text-[12px] font-semibold text-ink"
                style={{ background: 'var(--field)' }}
              >
                {isDefault ? 'Remove as my store' : 'Set as my store'}
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default function IndieScreen() {
  const [loc, setLoc] = useState<ResolvedLocation | null>(() => loadLocation())
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  const defaultStore = profile?.defaultStore ?? null

  const setDefault = (s: Store | null) =>
    updateProfile.mutate({ defaultStore: s ? { id: s.id, name: s.name, website: s.website } : null })

  const stores = useQuery({
    queryKey: ['bookstores', loc?.lat, loc?.lng],
    queryFn: async () => (loc ? findBookstores(loc.lat, loc.lng) : []),
    enabled: !!loc,
    staleTime: 1000 * 60 * 30,
  })

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
      <h1 className="text-[22px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
        Indie bookstores near you
      </h1>
      <div className="mt-3 rounded-xl border border-line p-3 text-[13px] text-muted" style={{ background: 'var(--card)' }}>
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
        {/* input + Find wrap as one unit — wrapping between them orphaned "Find" on its own line */}
        <div className="flex min-w-[240px] flex-1 items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void findByQuery()
            }}
            placeholder="ZIP code or city"
            aria-label="ZIP code or city"
            className="h-11 w-full min-w-0 flex-1 rounded-full border border-line px-4 text-[14px] text-ink outline-none"
            style={{ background: 'var(--field)' }}
          />
          <button
            type="button"
            onClick={() => void findByQuery()}
            disabled={busy || !query.trim()}
            className="h-11 shrink-0 rounded-full border border-line px-5 text-[14px] font-semibold text-ink disabled:opacity-50"
            style={{ background: 'var(--card)' }}
          >
            Find
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-[13px] text-primary">{error}</p>}

      {!loc ? (
        <div className="mt-6 rounded-2xl border border-line p-6 text-center">
          <p className="text-[14px] text-muted">Set a location to find nearby independent bookstores — or shop indies online:</p>
          <div className="flex justify-center">
            <ShopOnlineFallback />
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <p className="mb-2 text-[13.5px] text-ink">
            Near <span className="font-semibold">{loc.label}</span>{' '}
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

          {stores.isLoading && <p className="py-8 text-center text-[14px] text-muted">Finding nearby bookshops…</p>}
          {stores.isError && (
            <div className="rounded-2xl border border-line p-6 text-center">
              <p className="text-[14px] text-muted">Couldn’t reach the bookstore directory just now — but you can still support indies online:</p>
              <div className="flex justify-center">
                <ShopOnlineFallback />
              </div>
            </div>
          )}
          {stores.data && stores.data.length > 0 && (
            <>
              <StoreMap loc={loc} stores={stores.data} />
              <p className="mt-3 text-[12.5px] text-muted">
                {stores.data.length} independent shop(s) nearby · chains excluded
                {defaultStore ? ` · your store: ${defaultStore.name}` : ''}
              </p>
              <StoreList stores={stores.data} defaultId={defaultStore?.id ?? null} onSetDefault={setDefault} />
            </>
          )}
          {stores.data && stores.data.length === 0 && (
            <div className="mt-4 rounded-2xl border border-line p-6 text-center">
              <p className="text-[14px] text-muted">
                No independent bookstores found nearby — map coverage is uneven outside the US and some
                shops aren’t listed yet. You can still buy from indies online:
              </p>
              <div className="flex justify-center">
                <ShopOnlineFallback />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
