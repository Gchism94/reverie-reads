import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrandAtmosphere } from './BrandAtmosphere'

const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')
afterEach(() => {
  vi.restoreAllMocks()
  if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate)
  else Reflect.deleteProperty(HTMLElement.prototype, 'animate')
})

function setup(reduce = false) {
  const preference = Object.assign(new EventTarget(), { matches: reduce })
  vi.spyOn(window, 'matchMedia').mockReturnValue(preference as unknown as MediaQueryList)
  let hidden = false
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  const animation = { play: vi.fn(), pause: vi.fn(), cancel: vi.fn() }
  const animate = vi.fn(() => animation)
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate })
  return {
    animate,
    animation,
    preference,
    visibility: (next: boolean) => {
      hidden = next
      document.dispatchEvent(new Event('visibilitychange'))
    },
  }
}

describe('BrandAtmosphere', () => {
  it('starts still for reduced motion and responds when the reader changes that preference', () => {
    const { animate, animation, preference } = setup(true)
    const { unmount } = render(<BrandAtmosphere />)
    expect(animate).not.toHaveBeenCalled()
    act(() => {
      preference.matches = false
      preference.dispatchEvent(new Event('change'))
    })
    expect(animate).toHaveBeenCalledOnce()
    act(() => {
      preference.matches = true
      preference.dispatchEvent(new Event('change'))
    })
    expect(animation.cancel).toHaveBeenCalledOnce()
    unmount()
  })

  it('pauses the light in a hidden tab, resumes it, and releases it when leaving the front door', () => {
    const { animate, animation, visibility } = setup()
    const { unmount } = render(<BrandAtmosphere />)
    expect(animate).toHaveBeenCalledOnce()
    act(() => visibility(true))
    expect(animation.pause).toHaveBeenCalledOnce()
    act(() => visibility(false))
    expect(animation.play).toHaveBeenCalledOnce()
    expect(animate).toHaveBeenCalledOnce()
    unmount()
    expect(animation.cancel).toHaveBeenCalledOnce()
    act(() => visibility(false))
    expect(animation.play).toHaveBeenCalledOnce()
  })

  it('does not start an animation when the page is opened in a background tab', () => {
    const { animate, visibility } = setup()
    visibility(true)
    const { unmount } = render(<BrandAtmosphere />)
    expect(animate).not.toHaveBeenCalled()
    act(() => visibility(false))
    expect(animate).toHaveBeenCalledOnce()
    unmount()
  })
})
