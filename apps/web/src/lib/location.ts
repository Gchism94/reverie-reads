// Location resolution for the indie-bookstore finder. The chosen point is EPHEMERAL: kept in
// session storage only, never stored on the server. Geocoding goes through the `geo` Edge Function
// proxy (contact User-Agent + shared cache, per Nominatim usage policy) — not the browser directly.

import { supabase } from './supabase'

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

/** Geocode a place name → a point, via the `geo` proxy. Returns null on no match / failure. */
export async function geocodePlace(query: string): Promise<ResolvedLocation | null> {
  const q = query.trim()
  if (!q) return null
  try {
    const { data, error } = await supabase.functions.invoke('geo', { body: { op: 'geocode', q } })
    if (error) return null
    const rows = (data as { payload?: { lat: string; lon: string; display_name: string }[] } | null)
      ?.payload
    const r = rows?.[0]
    return r ? { lat: Number(r.lat), lng: Number(r.lon), label: r.display_name } : null
  } catch {
    return null
  }
}

/** Reverse-geocode a point → a label, via the `geo` proxy. Falls back to the raw coordinates. */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const fallback = `${lat.toFixed(3)}, ${lng.toFixed(3)}`
  try {
    const { data, error } = await supabase.functions.invoke('geo', {
      body: { op: 'reverse', lat, lng },
    })
    if (error) return fallback
    const j = (data as { payload?: { display_name?: string } } | null)?.payload
    return j?.display_name ?? fallback
  } catch {
    return fallback
  }
}
