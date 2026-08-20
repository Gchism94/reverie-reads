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
    fireEvent(third, new MouseEvent('pointerdown', { bubbles: true, clientX: 104 }))
    expect(onChange).toHaveBeenLastCalledWith(2.5)
    fireEvent(third, new MouseEvent('pointerdown', { bubbles: true, clientX: 116 }))
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
    expect(onChange).toHaveBeenLastCalledWith(0)
  })
})
