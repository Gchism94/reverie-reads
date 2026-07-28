// Indie-bookstore discovery — the PURE parsing for the OpenStreetMap Overpass results. The network
// call is proxied through the `geo` Edge Function (a contact User-Agent + server-side caching by
// rounded area, per OSM usage policy); this module turns the raw Overpass elements into Stores so
// the chain-exclusion + distance logic is unit-tested and runtime-agnostic.

export interface Store {
  id: string
  name: string
  lat: number
  lng: number
  address: string
  hours: string
  phone: string
  website: string
  distanceKm: number
}

export interface OverpassEl {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

// Heuristic chain-exclusion to bias toward independents. Not exhaustive — some indies may be
// missed and some chains may slip through; keep this list maintainable.
const CHAINS: RegExp[] = [
  /barnes\s*&?\s*noble/i,
  /books-?a-?million/i,
  /\bbam!?\b/i,
  /waterstones/i,
  /half\s*price\s*books/i,
  /\bfollett\b/i,
  /b\.?\s*dalton/i,
  /\bborders\b/i,
  /\bindigo\b/i,
  /\bchapters\b/i,
  /\bwhsmith\b/i,
  /\btarget\b/i,
  /\bwalmart\b/i,
  /\bcostco\b/i,
  /books\s*inc/i,
]
export const isChain = (name: string): boolean => CHAINS.some((re) => re.test(name))

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

/**
 * Rounded cache key for a nearby query — the grid cell + radius. ~2 decimals ≈ 1.1km cells, so
 * repeat searches from the same area share one cached Overpass response (the cost lever). The
 * client computes distances from the REAL point, so rounding the cache key doesn't blur results.
 */
export const geoCacheKey = (
  lat: number,
  lng: number,
  radiusMeters: number,
  precision = 2,
): string => `stores:${lat.toFixed(precision)},${lng.toFixed(precision)}:${radiusMeters}`

/** Turn raw Overpass elements into independent Stores, distance-sorted from (lat,lng). */
export function parseStores(elements: readonly OverpassEl[], lat: number, lng: number): Store[] {
  const stores: Store[] = []
  for (const el of elements ?? []) {
    const t = el.tags ?? {}
    const eLat = el.lat ?? el.center?.lat
    const eLng = el.lon ?? el.center?.lon
    if (eLat == null || eLng == null) continue
    const name = t.name ?? 'Unnamed bookshop'
    if (isChain(name)) continue
    const address = [
      t['addr:housenumber'],
      t['addr:street'],
      t['addr:city'],
      t['addr:state'],
      t['addr:postcode'],
    ]
      .filter(Boolean)
      .join(' ')
      .trim()
    stores.push({
      id: `${el.type}/${el.id}`,
      name,
      lat: eLat,
      lng: eLng,
      address,
      hours: t.opening_hours ?? '',
      phone: t.phone ?? t['contact:phone'] ?? '',
      website: t.website ?? t['contact:website'] ?? '',
      distanceKm: haversineKm(lat, lng, eLat, eLng),
    })
  }
  return stores.sort((a, b) => a.distanceKm - b.distanceKm)
}
