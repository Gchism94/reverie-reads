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
