import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Stars } from './Stars'

/**
 * The half-star control's contract. The a11y half is the feature (WAI-ARIA slider pattern:
 * keyboard half-steps, a human announcement at 3.5), and `step` defaulting to 1 is the first
 * fence keeping half stars out of the whole-star reviews composer — both asserted here.
 */

const slider = () => screen.getByRole('slider')

describe('Stars — display (no onChange)', () => {
  it('announces the value, including halves, as one label', () => {
    render(<Stars value={3.5} />)
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Rated 3.5 stars of 5')
  })

  it('display ignores step — a stored half star renders as itself even where the control is whole-star', () => {
    render(<Stars value={3.5} step={1} />)
    // step bounds what an interactive control can EMIT; a read-only view must not lie about
    // a stored value (per-read rows and the format line render with no step prop)
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Rated 3.5 stars of 5')
  })

  it('renders a 50% gold overlay for the half star and full for whole stars', () => {
    const { container } = render(<Stars value={2.5} step={0.5} />)
    // the fill lives one level deeper since the touch-target work: [data-star] > glyph > fill,
    // so the glyph box can stay its designed size inside a widened coarse-pointer target
    const overlays = [...container.querySelectorAll('[data-star] > span > span')] as HTMLElement[]
    expect(overlays.map((o) => o.style.width)).toEqual(['100%', '100%', '50%', '0%', '0%'])
  })
})

describe('Stars — interactive slider semantics', () => {
  it('is a single keyboard stop with the ARIA slider contract', () => {
    render(<Stars value={3} onChange={() => {}} step={0.5} />)
    const el = slider()
    expect(el).toHaveAttribute('tabindex', '0')
    expect(el).toHaveAttribute('aria-valuemin', '0')
    expect(el).toHaveAttribute('aria-valuemax', '5')
    expect(el).toHaveAttribute('aria-valuenow', '3')
    expect(el).toHaveAttribute('aria-valuetext', '3 stars')
  })

  it('announces halves as "3.5 stars", and zero as "No rating"', () => {
    const { rerender } = render(<Stars value={3.5} onChange={() => {}} step={0.5} />)
    expect(slider()).toHaveAttribute('aria-valuetext', '3.5 stars')
    rerender(<Stars value={0} onChange={() => {}} step={0.5} />)
    expect(slider()).toHaveAttribute('aria-valuetext', 'No rating')
  })

  it('ArrowRight/-Left move by the step — half steps are keyboard-reachable', () => {
    const onChange = vi.fn()
    render(<Stars value={3} onChange={onChange} step={0.5} />)
    fireEvent.keyDown(slider(), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(3.5)
    fireEvent.keyDown(slider(), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith(2.5)
  })

  it('with the default whole-star step, arrows move by 1 and can never emit a fraction', () => {
    const onChange = vi.fn()
    render(<Stars value={3} onChange={onChange} />)
    fireEvent.keyDown(slider(), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(4)
    for (const call of onChange.mock.calls) expect(Number.isInteger(call[0])).toBe(true)
  })

  it('Home clears to 0, End sets 5', () => {
    const onChange = vi.fn()
    render(<Stars value={2.5} onChange={onChange} step={0.5} />)
    fireEvent.keyDown(slider(), { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith(0)
    fireEvent.keyDown(slider(), { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith(5)
  })

  it('clamps at the ends — ArrowRight at 5 stays 5', () => {
    const onChange = vi.fn()
    render(<Stars value={5} onChange={onChange} step={0.5} />)
    fireEvent.keyDown(slider(), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(5)
  })

  it('pointer: left half of a star sets x−0.5, right half sets x (step=0.5)', () => {
    const onChange = vi.fn()
    const { container } = render(<Stars value={0} onChange={onChange} step={0.5} />)
    const third = container.querySelector('[data-star="3"]')!
    vi.spyOn(third, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 20,
      top: 0,
      right: 120,
      bottom: 20,
      height: 20,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    // jsdom has no PointerEvent — a MouseEvent with the pointerdown type carries clientX
    // A PRESS NO LONGER COMMITS — release does, so every click here is down-then-up. That is the
    // drag work's contract change: one gesture is one decision, so it is one write.
    fireEvent(third, new MouseEvent('pointerdown', { bubbles: true, clientX: 104 }))
    fireEvent(third, new MouseEvent('pointerup', { bubbles: true, clientX: 104 }))
    expect(onChange).toHaveBeenLastCalledWith(2.5)
    fireEvent(third, new MouseEvent('pointerdown', { bubbles: true, clientX: 116 }))
    fireEvent(third, new MouseEvent('pointerup', { bubbles: true, clientX: 116 }))
    expect(onChange).toHaveBeenLastCalledWith(3)
  })

  it('clicking the current value clears to 0 — the whole-star affordance, kept', () => {
    const onChange = vi.fn()
    const { container } = render(<Stars value={3} onChange={onChange} step={0.5} />)
    const third = container.querySelector('[data-star="3"]')!
    vi.spyOn(third, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 20,
      top: 0,
      right: 120,
      bottom: 20,
      height: 20,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    fireEvent(third, new MouseEvent('pointerdown', { bubbles: true, clientX: 116 }))
    fireEvent(third, new MouseEvent('pointerup', { bubbles: true, clientX: 116 }))
    expect(onChange).toHaveBeenLastCalledWith(0)
  })
})

/**
 * Hover preview — a SIGHTED-MOUSE-USER affordance, and the tests are mostly about what it must
 * NOT touch. The fill follows the cursor; the committed value, the announced value and the
 * keyboard's origin all stay put until a real click.
 */
describe('Stars — hover preview (fine pointer)', () => {
  /** Five 20px stars laid out end to end from x=100, so clientX maps to a known half. */
  const layOut = (container: HTMLElement) => {
    for (let i = 1; i <= 5; i++) {
      const el = container.querySelector(`[data-star="${i}"]`)!
      const left = 100 + (i - 1) * 20
      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
        left,
        width: 20,
        top: 0,
        right: left + 20,
        bottom: 20,
        height: 20,
        x: left,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect)
    }
  }
  const widths = (container: HTMLElement) =>
    ([...container.querySelectorAll('[data-star] > span > span')] as HTMLElement[]).map(
      (o) => o.style.width,
    )
  const starAt = (container: HTMLElement, i: number) =>
    container.querySelector(`[data-star="${i}"]`)!

  /** jsdom has no PointerEvent, so — as the pointerdown test above already does — this is a
   *  MouseEvent carrying clientX, with `pointerType` defined on it by hand. fireEvent's own
   *  pointerMove cannot supply either: it falls back to a bare Event, and clientX is a read-only
   *  getter on the MouseEvent prototype that Object.assign cannot shadow. */
  const pointer = (el: Element, type: string, clientX: number, pointerType: string) => {
    const ev = new MouseEvent(type, { bubbles: true, clientX })
    Object.defineProperty(ev, 'pointerType', { value: pointerType })
    fireEvent(el, ev)
  }
  const hover = (el: Element, clientX: number, pointerType = 'mouse') =>
    pointer(el, 'pointermove', clientX, pointerType)
  const press = (el: Element, clientX: number, pointerType = 'mouse') =>
    pointer(el, 'pointerdown', clientX, pointerType)

  it('a mouse moving across the stars fills to the cursor WITHOUT committing', () => {
    const onChange = vi.fn()
    const { container } = render(<Stars value={0} onChange={onChange} step={0.5} />)
    layOut(container)
    // right half of the 4th star -> preview 4
    hover(starAt(container, 4), 176, 'mouse')
    expect(widths(container)).toEqual(['100%', '100%', '100%', '100%', '0%'])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('previews halves too — the left half of a star shows x−0.5', () => {
    const onChange = vi.fn()
    const { container } = render(<Stars value={0} onChange={onChange} step={0.5} />)
    layOut(container)
    hover(starAt(container, 3), 144, 'mouse')
    expect(widths(container)).toEqual(['100%', '100%', '50%', '0%', '0%'])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('pointer leave reverts the fill to the committed value', () => {
    const { container } = render(<Stars value={2} onChange={() => {}} step={0.5} />)
    layOut(container)
    hover(starAt(container, 5), 196, 'mouse')
    expect(widths(container)).toEqual(['100%', '100%', '100%', '100%', '100%'])
    fireEvent.pointerLeave(screen.getByRole('slider'))
    expect(widths(container)).toEqual(['100%', '100%', '0%', '0%', '0%'])
  })

  it('pointer cancel reverts too — the browser taking the pointer is also an exit', () => {
    const { container } = render(<Stars value={1} onChange={() => {}} step={0.5} />)
    layOut(container)
    hover(starAt(container, 4), 176, 'mouse')
    expect(widths(container)[3]).toBe('100%')
    fireEvent.pointerCancel(screen.getByRole('slider'))
    expect(widths(container)).toEqual(['100%', '0%', '0%', '0%', '0%'])
  })

  it('TOUCH DOES NOT PREVIEW — a synthesised touch "hover" must not light the stars', () => {
    const { container } = render(<Stars value={1} onChange={() => {}} step={0.5} />)
    layOut(container)
    hover(starAt(container, 5), 196, 'touch')
    expect(widths(container)).toEqual(['100%', '0%', '0%', '0%', '0%'])
  })

  it('pen does not preview either — hover is only trustworthy from a device that has it', () => {
    const { container } = render(<Stars value={1} onChange={() => {}} step={0.5} />)
    layOut(container)
    hover(starAt(container, 5), 196, 'pen')
    expect(widths(container)).toEqual(['100%', '0%', '0%', '0%', '0%'])
  })

  it('THE ANNOUNCED VALUE DOES NOT MOVE while hovering — aria tracks the commit, not the cursor', () => {
    const { container } = render(<Stars value={2} onChange={() => {}} step={0.5} />)
    layOut(container)
    hover(starAt(container, 5), 196, 'mouse')
    // the eye sees five filled stars…
    expect(widths(container)).toEqual(['100%', '100%', '100%', '100%', '100%'])
    // …and a screen reader still hears the rating the reader actually set
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '2')
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '2 stars')
  })

  it('arrow keys step from the COMMITTED value even with the mouse resting elsewhere', () => {
    const onChange = vi.fn()
    const { container } = render(<Stars value={2} onChange={onChange} step={0.5} />)
    layOut(container)
    hover(starAt(container, 5), 196, 'mouse')
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
    // 2.5, not 5.5-clamped-to-5 — the hover is not the origin
    expect(onChange).toHaveBeenLastCalledWith(2.5)
  })

  it('a click commits what the preview was showing', () => {
    const onChange = vi.fn()
    const { container } = render(<Stars value={0} onChange={onChange} step={0.5} />)
    layOut(container)
    hover(starAt(container, 3), 144, 'mouse')
    press(starAt(container, 3), 144, 'mouse')
    pointer(starAt(container, 3), 'pointerup', 144, 'mouse') // release commits, not the press
    expect(onChange).toHaveBeenLastCalledWith(2.5)
  })

  it('clear-on-reclick survives hover — clicking the committed value still zeroes it', () => {
    const onChange = vi.fn()
    const { container } = render(<Stars value={3} onChange={onChange} step={0.5} />)
    layOut(container)
    hover(starAt(container, 3), 156, 'mouse')
    press(starAt(container, 3), 156, 'mouse')
    pointer(starAt(container, 3), 'pointerup', 156, 'mouse')
    // compares the click against the COMMITTED 3, not against the identical hover value
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('display mode never previews — the read-only rating has no hover handlers at all', () => {
    const { container } = render(<Stars value={2} step={0.5} />)
    layOut(container)
    hover(starAt(container, 5), 196, 'mouse')
    expect(widths(container)).toEqual(['100%', '100%', '0%', '0%', '0%'])
  })
})

/**
 * DRAG TO RATE — the finger moves, the stars follow, and nothing is written until it lifts.
 *
 * jsdom supplies neither `PointerEvent` nor `setPointerCapture`, so both are stubbed here. The
 * capture stub matters for more than not throwing: capture RETARGETS events to the capturing
 * element, and reproducing that retargeting is the only way a test can catch the bug where
 * `hitValue` read `e.target.closest('[data-star]')` and silently returned null for a whole drag.
 * The retarget case below fires its moves on the ROOT, which is exactly what a captured pointer
 * delivers.
 */
describe('Stars — drag to rate (touch)', () => {
  const layOut = (container: HTMLElement) => {
    for (let i = 1; i <= 5; i++) {
      const el = container.querySelector(`[data-star="${i}"]`)!
      const left = 100 + (i - 1) * 20
      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
        left,
        width: 20,
        top: 0,
        right: left + 20,
        bottom: 20,
        height: 20,
        x: left,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect)
    }
  }
  const widths = (container: HTMLElement) =>
    ([...container.querySelectorAll('[data-star] > span > span')] as HTMLElement[]).map(
      (o) => o.style.width,
    )
  const starAt = (container: HTMLElement, i: number) =>
    container.querySelector(`[data-star="${i}"]`)!

  /** A MouseEvent dressed as a pointer event, now also carrying a pointerId for capture. */
  const pointer = (el: Element, type: string, clientX: number, pointerType = 'touch') => {
    const ev = new MouseEvent(type, { bubbles: true, clientX })
    Object.defineProperty(ev, 'pointerType', { value: pointerType })
    Object.defineProperty(ev, 'pointerId', { value: 1 })
    fireEvent(el, ev)
  }

  /** jsdom has no pointer-capture API at all; without these the component's call throws into its
   *  own catch and the test would pass for the wrong reason. */
  const stubCapture = () => {
    const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>
    proto.setPointerCapture = vi.fn()
    proto.releasePointerCapture = vi.fn()
    proto.hasPointerCapture = vi.fn(() => true)
  }

  const setup = (value = 0) => {
    stubCapture()
    const onChange = vi.fn()
    const utils = render(<Stars value={value} onChange={onChange} step={0.5} />)
    layOut(utils.container)
    return { ...utils, onChange }
  }

  it('the fill follows the finger and NOTHING is committed until it lifts', () => {
    const { container, onChange } = setup(0)
    pointer(starAt(container, 1), 'pointerdown', 104) // star 1, left half -> 0.5
    expect(widths(container)).toEqual(['50%', '0%', '0%', '0%', '0%'])

    pointer(starAt(container, 3), 'pointermove', 155) // star 3 spans 140-160; 155 = right half -> 3
    expect(widths(container)).toEqual(['100%', '100%', '100%', '0%', '0%'])

    pointer(starAt(container, 4), 'pointermove', 164) // star 4, left half -> 3.5
    expect(widths(container)).toEqual(['100%', '100%', '100%', '50%', '0%'])

    expect(onChange, 'the drag wrote while it was still moving').not.toHaveBeenCalled()
    pointer(starAt(container, 4), 'pointerup', 164)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(3.5)
  })

  it('tracks even when capture RETARGETS the moves to the root', () => {
    // The regression case for the `closest('[data-star]')` bug: every move arrives on the root,
    // never on a star. Coordinate-based hit-testing must still resolve it.
    const { container, onChange } = setup(0)
    const root = screen.getByRole('slider')
    pointer(root, 'pointerdown', 104)
    pointer(root, 'pointermove', 185) // star 5, left half -> 4.5
    expect(
      widths(container),
      'a captured drag stopped updating — hit-testing is reading e.target again',
    ).toEqual(['100%', '100%', '100%', '100%', '50%'])
    pointer(root, 'pointerup', 185)
    expect(onChange).toHaveBeenCalledWith(4.5)
  })

  it('aria keeps announcing the COMMITTED value throughout the drag', () => {
    const { container } = setup(2)
    const root = screen.getByRole('slider')
    expect(root).toHaveAttribute('aria-valuenow', '2')
    pointer(starAt(container, 1), 'pointerdown', 104)
    pointer(starAt(container, 5), 'pointermove', 195)
    // The eye sees 5; a screen reader must still hear the rating the reader actually has.
    expect(widths(container)).toEqual(['100%', '100%', '100%', '100%', '100%'])
    expect(root, 'aria announced a value mid-drag that was never committed').toHaveAttribute(
      'aria-valuenow',
      '2',
    )
    expect(root).toHaveAttribute('aria-valuetext', '2 stars')
  })

  it('a TAP on the current value clears it — the affordance survives', () => {
    const { container, onChange } = setup(3)
    pointer(starAt(container, 3), 'pointerdown', 155) // star 3 right half -> 3, the value held
    pointer(starAt(container, 3), 'pointerup', 155)
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('a DRAG that lands on the current value does NOT clear it', () => {
    // Landing where you meant to land is precision, not a request to erase. Only a tap clears.
    const { container, onChange } = setup(3)
    pointer(starAt(container, 1), 'pointerdown', 104)
    pointer(starAt(container, 3), 'pointermove', 155) // moved -> this is a drag
    pointer(starAt(container, 3), 'pointerup', 155)
    expect(onChange, 'a drag onto the held value erased it').toHaveBeenCalledWith(3)
  })

  it('a cancelled gesture commits nothing', () => {
    const { container, onChange } = setup(1)
    pointer(starAt(container, 4), 'pointerdown', 164)
    pointer(starAt(container, 4), 'pointercancel', 164)
    expect(onChange).not.toHaveBeenCalled()
    // and the display returns to the committed value rather than staying on the abandoned preview
    expect(widths(container)).toEqual(['100%', '0%', '0%', '0%', '0%'])
  })

  it('leaves vertical scrolling to the page — touch-action is pan-y, not none', () => {
    setup(0)
    expect((screen.getByRole('slider') as HTMLElement).style.touchAction).toBe('pan-y')
  })
})
