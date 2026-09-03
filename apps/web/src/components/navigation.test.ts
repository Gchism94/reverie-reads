import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SKINS, type SkinId } from '@reverie/core'
import {
  MOBILE_TAB_ITEMS,
  MORE_NAVIGATION_ITEMS,
  NAVIGATION_GROUPS,
  NAVIGATION_ITEMS,
  navigationLabelForPath,
} from './navigation'

describe('navigation contract', () => {
  it('uses one complete, duplicate-free destination model', () => {
    const grouped = NAVIGATION_GROUPS.flatMap((group) => group.items)
    expect(grouped).toEqual(NAVIGATION_ITEMS)
    expect(new Set(NAVIGATION_ITEMS.map((item) => item.to)).size).toBe(NAVIGATION_ITEMS.length)
    expect(MOBILE_TAB_ITEMS.map((item) => item.label)).toEqual(['Home', 'Library', 'Tropes'])
    expect(MORE_NAVIGATION_ITEMS.some((item) => item.label === 'Skins')).toBe(true)
    expect(MORE_NAVIGATION_ITEMS.some((item) => item.label === 'Settings')).toBe(true)
  })

  it('gives every registered skin a desktop surface, active state, and mobile dock', () => {
    const css = readFileSync(join(__dirname, '..', 'styles', 'skin-kit.css'), 'utf8')

    for (const skin of Object.keys(SKINS) as SkinId[]) {
      expect(css, `${skin}: desktop surface`).toContain(`[data-skin='${skin}'] .rv-nav-surface`)
      expect(css, `${skin}: active destination`).toContain(
        `[data-skin='${skin}'] .rv-nav-item-active`,
      )
      expect(css, `${skin}: mobile dock`).toContain(`[data-skin='${skin}'] .rv-mobile-dock`)
    }
  })

  it('names primary and detail destinations in compact mobile chrome', () => {
    expect(navigationLabelForPath('/')).toBe('Home')
    expect(navigationLabelForPath('/library')).toBe('Library')
    expect(navigationLabelForPath('/series/the-court')).toBe('Series')
    expect(navigationLabelForPath('/tropes/slow-burn')).toBe('Trope')
    expect(navigationLabelForPath('/book/abc-123')).toBe('Book record')
    expect(navigationLabelForPath('/add')).toBe('Add a book')
    expect(navigationLabelForPath('/something-new')).toBe('Reading room')
  })
})
