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
