import { describe, expect, it } from 'vitest'
import type { Book } from '@reverie/core'
import { resharpenSource } from './resharpenCovers'

const book = (b: Partial<Book>): Book => ({ id: 'b', title: 'T', cover: '', ...b }) as Book
const STORAGE = 'https://x.supabase.co/storage/v1/object/public/covers/u/a/b.webp'
const GOOGLE = 'https://books.google.com/books/content?id=X&img=1&zoom=1&source=gbs_api'

describe('resharpenSource (which covers the sweep re-fetches)', () => {
  it('targets a raw upgradeable hotlink (Google/OL) → the hotlink itself', () => {
    expect(resharpenSource(book({ cover: GOOGLE }))).toBe(GOOGLE)
    expect(resharpenSource(book({ cover: 'https://covers.openlibrary.org/b/id/9-M.jpg' }))).toContain('openlibrary')
  })

  it('targets a stored cover whose ORIGIN is upgradeable → the source URL (backfilled ~128px)', () => {
    expect(resharpenSource(book({ cover: STORAGE, coverSourceUrl: GOOGLE }))).toBe(GOOGLE)
  })

  it('skips a user-chosen cover — sacred, never re-fetched', () => {
    expect(resharpenSource(book({ cover: GOOGLE, coverUserChosen: true }))).toBeNull()
    expect(resharpenSource(book({ cover: STORAGE, coverSourceUrl: GOOGLE, coverUserChosen: true }))).toBeNull()
  })

  it('skips the reader’s own camera/upload images', () => {
    expect(resharpenSource(book({ cover: GOOGLE, coverSource: 'camera' }))).toBeNull()
    expect(resharpenSource(book({ cover: STORAGE, coverSourceUrl: GOOGLE, coverSource: 'upload' }))).toBeNull()
  })

  it('skips covers with nothing higher-res: no cover, Hardcover/B&N, stored w/o upgradeable origin', () => {
    expect(resharpenSource(book({ cover: '' }))).toBeNull()
    expect(resharpenSource(book({ cover: 'https://assets.hardcover.app/x.jpeg' }))).toBeNull()
    expect(resharpenSource(book({ cover: STORAGE }))).toBeNull() // no coverSourceUrl to upgrade
    expect(resharpenSource(book({ cover: STORAGE, coverSourceUrl: 'https://assets.hardcover.app/x.jpeg' }))).toBeNull()
  })
})
