import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LevelPicker } from './LevelPicker'

/**
 * The guide's whole reason to exist is that a reader can read what a level MEANS without setting
 * it. So most of these assert that a preview does NOT commit — the failure mode is a guide that
 * "works" while quietly changing the reader's data underneath them.
 */

const LEVELS = ['None on the page', 'Kisses', 'Closed door', 'On the page', 'Explicit', 'Throughout']

const setup = (value = 0) => {
  const onChange = vi.fn()
  const utils = render(
    <LevelPicker
      label="Spice"
      glyph="🌶️"
      levels={LEVELS}
      value={value}
      onChange={onChange}
      name="intensity"
    />,
  )
  const level = (i: number) => screen.getByRole('button', { name: new RegExp(`^Spice ${i} —`) })
  return { ...utils, onChange, level }
}

/** jsdom has no PointerEvent; pointerType has to be defined on a MouseEvent by hand. */
const enter = (el: Element, pointerType = 'mouse') => {
  const ev = new MouseEvent('pointerover', { bubbles: true })
  Object.defineProperty(ev, 'pointerType', { value: pointerType })
  fireEvent(el, ev)
}

describe('LevelPicker — the resting state', () => {
  it('shows the selected level’s definition when nothing is open', () => {
    setup(3)
    expect(screen.getByText(LEVELS[3])).toBeInTheDocument()
  })

  it('shows level 0’s definition when nothing is set', () => {
    setup(0)
    expect(screen.getByText(LEVELS[0])).toBeInTheDocument()
  })
})

describe('LevelPicker — preview without committing', () => {
  it('KEYBOARD FOCUS previews a level and does not change the value', () => {
    const { onChange, level } = setup(1)
    fireEvent.focus(level(4))
    expect(screen.getByRole('status')).toHaveTextContent(LEVELS[4])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('blur returns to the selected level’s definition', () => {
    const { level } = setup(1)
    fireEvent.focus(level(4))
    expect(screen.getByRole('status')).toHaveTextContent(LEVELS[4])
    fireEvent.blur(level(4))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText(LEVELS[1])).toBeInTheDocument()
  })

  it('a MOUSE hover previews without committing', () => {
    const { onChange, level } = setup(0)
    enter(level(2))
    expect(screen.getByRole('status')).toHaveTextContent(LEVELS[2])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a TOUCH pointer does not preview — it would fight the tap that follows', () => {
    const { level } = setup(0)
    enter(level(2), 'touch')
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('LevelPicker — click pins, and still sets the level', () => {
  it('a click sets the value AND pins that level’s guide', () => {
    const { onChange, level } = setup(0)
    fireEvent.click(level(4))
    expect(onChange).toHaveBeenCalledWith(4)
    expect(screen.getByRole('status')).toHaveTextContent(LEVELS[4])
  })

  it('re-clicking the same level closes the guide it pinned', () => {
    const { level } = setup(0)
    fireEvent.click(level(4))
    expect(screen.getByRole('status')).toBeInTheDocument()
    fireEvent.click(level(4))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('clear-on-reclick is untouched — clicking the SELECTED level still zeroes it', () => {
    // The picker's pre-existing affordance, asserted here because the pin toggle now shares the
    // same click and must not have eaten it. `value` is a prop, so the parent's state is simulated
    // by re-rendering with what onChange was called with.
    const onChange = vi.fn()
    const { rerender } = render(
      <LevelPicker
        label="Spice"
        glyph="🌶️"
        levels={LEVELS}
        value={0}
        onChange={onChange}
        name="intensity"
      />,
    )
    const at = (i: number) => screen.getByRole('button', { name: new RegExp(`^Spice ${i} —`) })
    fireEvent.click(at(4))
    expect(onChange).toHaveBeenLastCalledWith(4)
    rerender(
      <LevelPicker
        label="Spice"
        glyph="🌶️"
        levels={LEVELS}
        value={4}
        onChange={onChange}
        name="intensity"
      />,
    )
    fireEvent.click(at(4))
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('a pin outranks a hover — drifting the mouse away does not swap the text mid-read', () => {
    const { level } = setup(0)
    fireEvent.click(level(5))
    enter(level(1))
    expect(screen.getByRole('status')).toHaveTextContent(LEVELS[5])
  })
})

describe('LevelPicker — dismissal follows Modal’s conventions', () => {
  it('Escape closes a pinned guide', () => {
    const { level } = setup(0)
    fireEvent.click(level(3))
    expect(screen.getByRole('status')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('a click outside closes it', () => {
    const { level } = setup(0)
    fireEvent.click(level(3))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('a click INSIDE the picker does not close it', () => {
    const { level } = setup(0)
    fireEvent.click(level(3))
    fireEvent.pointerDown(level(3))
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('the close control is labelled and dismisses — outside-click is neither discoverable nor keyboard-reachable', () => {
    const { level } = setup(0)
    fireEvent.click(level(2))
    fireEvent.click(screen.getByRole('button', { name: 'Close the Spice level guide' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('no close control on a mere hover — there is nothing pinned to dismiss', () => {
    const { level } = setup(0)
    enter(level(2))
    expect(screen.queryByRole('button', { name: /Close the Spice level guide/ })).toBeNull()
  })
})

describe('LevelPicker — the accessible wiring', () => {
  it('each glyph names its own level and definition', () => {
    const { level } = setup(0)
    expect(level(3)).toHaveAttribute('aria-label', `Spice 3 — ${LEVELS[3]}`)
  })

  it('aria-pressed marks every level up to the value, as the picker always did', () => {
    const { level } = setup(3)
    expect(level(3)).toHaveAttribute('aria-pressed', 'true')
    expect(level(4)).toHaveAttribute('aria-pressed', 'false')
  })

  it('the open guide is described-by the level that opened it, and expanded only when pinned', () => {
    const { level } = setup(0)
    fireEvent.click(level(2))
    expect(level(2)).toHaveAttribute('aria-expanded', 'true')
    expect(level(2)).toHaveAttribute('aria-describedby', 'level-guide-intensity')
    expect(screen.getByRole('status')).toHaveAttribute('id', 'level-guide-intensity')
  })

  it('two pickers on one screen own distinct guide ids', () => {
    render(
      <LevelPicker
        label="Darkness"
        glyph="🌑"
        levels={LEVELS}
        value={0}
        onChange={() => {}}
        name="darkness"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Darkness 2 —/ }))
    expect(screen.getByRole('status')).toHaveAttribute('id', 'level-guide-darkness')
  })
})
