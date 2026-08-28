import { describe, expect, it } from 'vitest'
import { isHouseholdAddContext } from './appShellScope'

describe('persistent Add scope', () => {
  it('keeps household scope on the household library and add route', () => {
    expect(isHouseholdAddContext('/library', { scope: 'household' })).toBe(true)
    expect(isHouseholdAddContext('/add', { scope: 'household' })).toBe(true)
  })

  it('fails closed to personal outside the explicit household context', () => {
    expect(isHouseholdAddContext('/library', {})).toBe(false)
    expect(isHouseholdAddContext('/library', { scope: 'personal' })).toBe(false)
    expect(isHouseholdAddContext('/settings', { scope: 'household' })).toBe(false)
  })
})
