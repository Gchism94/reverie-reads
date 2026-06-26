import { beforeEach, describe, expect, it } from 'vitest'
import { resolveMode, useSkin } from './useSkin'

describe('useSkin store', () => {
  beforeEach(() => {
    localStorage.clear()
    useSkin.getState().hydrate('tryst', 'dark', null)
  })

  it('applies skin and resolved mode onto <html> (independent axes)', () => {
    useSkin.getState().setSkin('grimoire')
    expect(document.documentElement.dataset.skin).toBe('grimoire')
    expect(document.documentElement.dataset.mode).toBe('dark') // mode unchanged by skin switch

    useSkin.getState().setMode('light')
    expect(document.documentElement.dataset.mode).toBe('light')
    expect(document.documentElement.dataset.skin).toBe('grimoire') // skin unchanged by mode switch
    expect(useSkin.getState().resolvedMode).toBe('light')
  })

  it('persists both axes to localStorage', () => {
    useSkin.getState().setSkin('marrow')
    useSkin.getState().setMode('light')
    expect(localStorage.getItem('reverie.skin')).toBe('marrow')
    expect(localStorage.getItem('reverie.mode')).toBe('light')
  })

  it('resolveMode maps explicit modes through and resolves system to a concrete mode', () => {
    expect(resolveMode('light')).toBe('light')
    expect(resolveMode('dark')).toBe('dark')
    expect(['light', 'dark']).toContain(resolveMode('system'))
  })
})
