import { describe, expect, it } from 'vitest'
import { isNewBuild } from './updates'

describe('isNewBuild', () => {
  it('flags a different deployed build id', () => {
    expect(isNewBuild('abc123', 'def456')).toBe(true)
  })

  it('ignores the same build, missing responses, and empty ids', () => {
    expect(isNewBuild('abc123', 'abc123')).toBe(false)
    expect(isNewBuild(null, 'abc123')).toBe(false)
    expect(isNewBuild('', 'abc123')).toBe(false)
  })
})

describe('BUILD_LABEL', () => {
  it('is a short, human-readable stamp', async () => {
    const { BUILD_LABEL, BUILD_ID } = await import('./updates')
    expect(BUILD_LABEL.length).toBeLessThanOrEqual(7)
    expect(BUILD_ID === 'dev' ? BUILD_LABEL === 'dev' : BUILD_LABEL === BUILD_ID.slice(0, 7)).toBe(true)
  })
})
