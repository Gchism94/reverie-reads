import { describe, expect, it } from 'vitest'
import {
  buildGoogleBooksUrl,
  buildOpenLibraryUrl,
  coverKey,
  extractGoogleCover,
  extractOpenLibraryCover,
  fetchCover,
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
