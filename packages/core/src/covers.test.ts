import { describe, expect, it } from 'vitest'
import {
  buildGoogleBooksUrl,
  buildOpenLibraryUrl,
  coverKey,
  enrichmentCoverFill,
  extractGoogleCover,
  extractOpenLibraryCover,
  fetchCover,
  isCoverSource,
  isStoredCoverUrl,
  isUpgradeableCoverUrl,
  upgradeCoverUrl,
} from './covers'

describe('cover helpers', () => {
  it('builds a normalized cover key and query URLs', () => {
    expect(coverKey({ title: 'Iron Flame', last: 'Yarros' })).toBe('ironflame|yarros')
    expect(buildGoogleBooksUrl({ title: 'Iron Flame', last: 'Yarros' })).toContain('intitle:')
    expect(buildOpenLibraryUrl({ title: 'Iron Flame' })).toContain('openlibrary.org/search.json')
  })

  it('extracts covers and forces https on Google thumbnails', () => {
    expect(
      extractGoogleCover({ items: [{ volumeInfo: { imageLinks: { thumbnail: 'http://x/y?z&edge=curl' } } }] }),
    ).toBe('https://x/y?z')
    expect(extractOpenLibraryCover({ docs: [{ cover_i: 123 }] })).toBe(
      'https://covers.openlibrary.org/b/id/123-M.jpg',
    )
    expect(extractGoogleCover({ items: [] })).toBe('')
  })

  it('falls back from Google to Open Library', async () => {
    const fake = (url: string) => ({
      json: () =>
        Promise.resolve(url.includes('googleapis') ? { items: [] } : { docs: [{ cover_i: 7 }] }),
    })
    expect(await fetchCover({ title: 'X', last: 'Y' }, (u) => Promise.resolve(fake(u)))).toBe(
      'https://covers.openlibrary.org/b/id/7-M.jpg',
    )
  })
})

describe('cover system provenance + non-overwrite', () => {
  it('recognizes stored (durable) cover URLs vs external hotlinks', () => {
    expect(isStoredCoverUrl('https://x.supabase.co/storage/v1/object/public/covers/u/a/b.webp')).toBe(true)
    expect(isStoredCoverUrl('https://books.google.com/books/content?id=1')).toBe(false)
    expect(isStoredCoverUrl('')).toBe(false)
  })

  it('validates cover sources', () => {
    for (const s of ['hardcover', 'google', 'openlibrary', 'upload', 'camera', 'url']) {
      expect(isCoverSource(s)).toBe(true)
    }
    expect(isCoverSource('amazon')).toBe(false)
    expect(isCoverSource(undefined)).toBe(false)
  })

  it('enrichment never overwrites a user-chosen cover', () => {
    expect(enrichmentCoverFill({ cover: 'https://stored/u.webp', coverUserChosen: true }, 'https://g/new.jpg')).toBe('')
    // even after the reader clears the image, their choice stands
    expect(enrichmentCoverFill({ cover: '', coverUserChosen: true }, 'https://g/new.jpg')).toBe('')
  })

  it('enrichment is fill-only: existing covers stay, blanks fill', () => {
    expect(enrichmentCoverFill({ cover: 'https://seed/cover.jpg' }, 'https://g/new.jpg')).toBe('')
    expect(enrichmentCoverFill({ cover: '' }, 'https://g/new.jpg')).toBe('https://g/new.jpg')
    expect(enrichmentCoverFill({ cover: '', coverUserChosen: false }, '')).toBe('')
  })
})

describe('upgradeCoverUrl', () => {
  const G = 'https://books.google.com/books/content?id=ABC&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api'

  it('raises Google Books zoom to 0 (largest) for full and strips the page-curl', () => {
    const u = upgradeCoverUrl(G, 'full')
    expect(u).toContain('zoom=0')
    expect(u).not.toContain('zoom=1')
    expect(u).not.toContain('edge=curl')
    expect(u).toContain('id=ABC')
  })

  it('uses zoom=2 (~300px) for a light grid thumb', () => {
    expect(upgradeCoverUrl(G, 'thumb')).toContain('zoom=2')
  })

  it('adds a zoom param when none is present', () => {
    expect(upgradeCoverUrl('https://books.google.com/books/content?id=X&img=1', 'full')).toContain('zoom=0')
  })

  it('is idempotent (re-upgrading a full URL is a no-op)', () => {
    const once = upgradeCoverUrl(G, 'full')
    expect(upgradeCoverUrl(once, 'full')).toBe(once)
  })

  it('swaps the Open Library size suffix (-M → -L for full, -S → -M for thumb)', () => {
    expect(upgradeCoverUrl('https://covers.openlibrary.org/b/id/123-M.jpg', 'full')).toBe('https://covers.openlibrary.org/b/id/123-L.jpg')
    expect(upgradeCoverUrl('https://covers.openlibrary.org/b/id/123-S.jpg', 'thumb')).toBe('https://covers.openlibrary.org/b/id/123-M.jpg')
  })

  it('leaves Hardcover, B&N, storage, and empty URLs untouched', () => {
    const hc = 'https://assets.hardcover.app/editions/30707731/abc.jpeg'
    const bn = 'https://prodimage.images-bn.com/pimages/9781635575569_p0_v6_s600x595.jpg'
    const store = 'https://x.supabase.co/storage/v1/object/public/covers/u/a/b.webp'
    expect(upgradeCoverUrl(hc)).toBe(hc)
    expect(upgradeCoverUrl(bn)).toBe(bn)
    expect(upgradeCoverUrl(store)).toBe(store)
    expect(upgradeCoverUrl('')).toBe('')
  })

  it('isUpgradeableCoverUrl flags only Google/OL sources', () => {
    expect(isUpgradeableCoverUrl(G)).toBe(true)
    expect(isUpgradeableCoverUrl('https://covers.openlibrary.org/b/id/9-M.jpg')).toBe(true)
    expect(isUpgradeableCoverUrl('https://assets.hardcover.app/x.jpeg')).toBe(false)
    expect(isUpgradeableCoverUrl('')).toBe(false)
  })
})
