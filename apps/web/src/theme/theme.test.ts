import { describe, expect, it } from 'vitest'
import { nextTheme } from './useTheme'

describe('nextTheme', () => {
  it('toggles nocturne to dawn and back', () => {
    expect(nextTheme('nocturne')).toBe('dawn')
    expect(nextTheme('dawn')).toBe('nocturne')
  })
})
