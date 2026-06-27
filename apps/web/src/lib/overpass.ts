// Nearby indie-bookstore discovery. The Overpass call is PROXIED through the `geo` Edge Function
// (a contact User-Agent + shared server-side cache by rounded area, per OSM usage policy) — never
// hit from the browser directly. Raw elements come back; the pure parse/chain-exclusion/distance
// logic lives in @reverie/core (indie.ts) so it stays unit-tested.

import { parseStores, type OverpassEl, type Store } from '@reverie/core'
import { supabase } from './supabase'

export type { Store } from '@reverie/core'

/** Find independent bookstores near a point (chains excluded, distance-sorted). Throws on a proxy
 *  failure so the caller can show its degraded state. */
export async function findBookstores(lat: number, lng: number, radiusMeters = 25000): Promise<Store[]> {
  const { data, error } = await supabase.functions.invoke('geo', {
    body: { op: 'stores', lat, lng, radius: radiusMeters },
  })
  if (error) throw error
  const payload = (data as { payload?: { elements?: OverpassEl[] } } | null)?.payload
  return parseStores(payload?.elements ?? [], lat, lng)
}
