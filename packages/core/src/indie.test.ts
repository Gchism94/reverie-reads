import { describe, expect, it } from 'vitest'
import { geoCacheKey, haversineKm, isChain, parseStores, type OverpassEl } from './indie'

describe('isChain', () => {
  it('excludes known chains, keeps independents', () => {
    expect(isChain('Barnes & Noble')).toBe(true)
    expect(isChain('Books-A-Million')).toBe(true)
    expect(isChain('Half Price Books')).toBe(true)
    expect(isChain('Faulkner House Books')).toBe(false)
    expect(isChain('Octavia Books')).toBe(false)
  })
})

describe('haversineKm', () => {
  it('is ~0 for the same point and grows with distance', () => {
    expect(haversineKm(29.95, -90.07, 29.95, -90.07)).toBeCloseTo(0, 5)
    // New Orleans → Baton Rouge ≈ 100km
    const d = haversineKm(29.95, -90.07, 30.45, -91.19)
    expect(d).toBeGreaterThan(110)
    expect(d).toBeLessThan(135)
  })
})

describe('geoCacheKey', () => {
  it('rounds to a grid cell so nearby points share a key', () => {
    expect(geoCacheKey(29.9511, -90.0715, 25000)).toBe('stores:29.95,-90.07:25000')
    // points within the same ~1km cell collapse to one key
    expect(geoCacheKey(29.9549, -90.0742, 25000)).toBe(geoCacheKey(29.9511, -90.0715, 25000))
    // a different radius is a different key
    expect(geoCacheKey(29.95, -90.07, 10000)).not.toBe(geoCacheKey(29.95, -90.07, 25000))
  })
})

describe('parseStores', () => {
  const els: OverpassEl[] = [
    {
      type: 'node',
      id: 1,
      lat: 29.96,
      lon: -90.06,
      tags: {
        name: 'Crescent City Books',
        'addr:street': 'Chartres St',
        'addr:city': 'New Orleans',
        opening_hours: '10:00-18:00',
        website: 'https://ccbooks.com',
      },
    },
    { type: 'way', id: 2, center: { lat: 29.99, lon: -90.1 }, tags: { name: 'Barnes & Noble' } }, // chain → excluded
    { type: 'node', id: 3, lat: 29.95, lon: -90.07, tags: {} }, // unnamed, kept (no name)
    { type: 'node', id: 4, tags: { name: 'No Coords' } }, // missing coords → skipped
  ]
  it('drops chains + coordless elements, maps fields, sorts by distance', () => {
    const out = parseStores(els, 29.95, -90.07)
    expect(out.map((s) => s.id)).toEqual(['node/3', 'node/1']) // node/3 is closest
    const ccb = out.find((s) => s.id === 'node/1')!
    expect(ccb.name).toBe('Crescent City Books')
    expect(ccb.address).toBe('Chartres St New Orleans')
    expect(ccb.website).toBe('https://ccbooks.com')
    expect(ccb.distanceKm).toBeGreaterThan(0)
    expect(out.some((s) => s.name === 'Barnes & Noble')).toBe(false)
  })
  it('handles way/relation center coords + contact:* fallbacks', () => {
    const out = parseStores(
      [
        {
          type: 'way',
          id: 9,
          center: { lat: 29.95, lon: -90.07 },
          tags: { name: 'Indie', 'contact:phone': '555-1234', 'contact:website': 'https://i.co' },
        },
      ],
      29.95,
      -90.07,
    )
    expect(out[0]).toMatchObject({ name: 'Indie', phone: '555-1234', website: 'https://i.co' })
  })
})
