// Location resolution for the indie-bookstore finder. Treated as EPHEMERAL: kept in session
// storage only, never sent to or stored on the server.

export interface ResolvedLocation {
  lat: number
  lng: number
  label: string
}

const KEY = 'reverie.location'

export function loadLocation(): ResolvedLocation | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as ResolvedLocation) : null
  } catch {
    return null
  }
}

export function saveLocation(loc: ResolvedLocation | null): void {
  try {
    if (loc) sessionStorage.setItem(KEY, JSON.stringify(loc))
    else sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** Browser geolocation, triggered by a user gesture (= consent). Resolves null on deny/unavailable. */
export function requestGeolocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  })
}

// Free geocoding via OpenStreetMap Nominatim. Note: production should proxy this through an
// Edge Function with a contact User-Agent + caching (Nominatim asks ~1 req/s); fine for now.
const NOMINATIM = 'https://nominatim.openstreetmap.org'

export async function geocodePlace(query: string): Promise<ResolvedLocation | null> {
  const q = query.trim()
  if (!q) return null
  try {
    const res = await fetch(`${NOMINATIM}/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, {
      headers: { Accept: 'application/json' },
    })
    const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[]
    const r = rows[0]
    return r ? { lat: Number(r.lat), lng: Number(r.lon), label: r.display_name } : null
  } catch {
    return null
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}`, {
      headers: { Accept: 'application/json' },
    })
    const j = (await res.json()) as { display_name?: string }
    return j.display_name ?? `${lat.toFixed(3)}, ${lng.toFixed(3)}`
  } catch {
    return `${lat.toFixed(3)}, ${lng.toFixed(3)}`
  }
}
