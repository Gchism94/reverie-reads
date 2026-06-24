// Nearby bookstore discovery via OpenStreetMap Overpass (free, no key). v1 client-side;
// production should proxy this through an Edge Function with a contact User-Agent + caching
// and rate-limiting (same hardening note as Nominatim). OSM data is uneven — many shops lack
// hours/phone — so the UI degrades gracefully.

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
const isChain = (name: string) => CHAINS.some((re) => re.test(name))

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

interface OverpassEl {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

const OVERPASS = 'https://overpass-api.de/api/interpreter'

/** Find independent bookstores near a point (nodes + ways + relations; chains excluded). */
export async function findBookstores(lat: number, lng: number, radiusMeters = 25000): Promise<Store[]> {
  const around = `(around:${radiusMeters},${lat},${lng})`
  const query = `[out:json][timeout:25];(node["shop"="books"]${around};way["shop"="books"]${around};relation["shop"="books"]${around};);out center;`
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
  })
  if (!res.ok) throw new Error(`Overpass ${res.status}`)
  const json = (await res.json()) as { elements?: OverpassEl[] }

  const stores: Store[] = []
  for (const el of json.elements ?? []) {
    const t = el.tags ?? {}
    const eLat = el.lat ?? el.center?.lat
    const eLng = el.lon ?? el.center?.lon
    if (eLat == null || eLng == null) continue
    const name = t.name ?? 'Unnamed bookshop'
    if (isChain(name)) continue
    const address = [t['addr:housenumber'], t['addr:street'], t['addr:city'], t['addr:state'], t['addr:postcode']]
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
