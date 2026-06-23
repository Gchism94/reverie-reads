import { describe, expect, it } from 'vitest'
import { APP_NAME } from './index'

describe('@reverie/core', () => {
  it('exposes a non-empty app name', () => {
    expect(typeof APP_NAME).toBe('string')
    expect(APP_NAME.length).toBeGreaterThan(0)
  })
})
