import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Book } from '@reverie/core'

// HOW MANY writes one release gesture produces — the same question planEditor.test.tsx asks of one
// plan edit, and the same answer: exactly one.
//
// `onPointerUp` and `onBlur` both committed the slider, with the identical payload. Idempotent, so
// ordering could never corrupt it — pure waste, a doubled request on every release. The fix dedupes
// on the value rather than deleting a handler, because the two handlers are not redundant: a drag
// fires only `onPointerUp`, and a KEYBOARD user fires only `onBlur` (arrow keys move the thumb with
// no pointer event). Deleting either one silently drops an input method, which is why the tests
// below cover both separately and then together.
//
// Deterministic by construction: it counts calls to a mocked mutation, so nothing depends on
// request timing.

const mutate = vi.fn()
vi.mock('../data/books', () => ({ useUpdateBook: () => ({ mutate }) }))

const { ProgressSlider } = await import('./BookDetailRoute')

beforeEach(() => mutate.mockClear())

const book = (progress: number): Pick<Book, 'id' | 'progress'> => ({ id: 'b1', progress })

describe('ProgressSlider commits once per gesture', () => {
  it('a drag then a blur writes ONCE, not twice', () => {
    render(<ProgressSlider book={book(10)} />)
    const slider = screen.getByLabelText('Reading progress')

    fireEvent.change(slider, { target: { value: '40' } })
    fireEvent.pointerUp(slider)
    fireEvent.blur(slider) // the second half of the old double-write
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith({ id: 'b1', patch: { progress: 40 } })
  })

  // The reason the fix is a dedupe and not a deleted handler. Under "drop onBlur" this writes zero
  // times: arrow keys produce no pointer event, so onPointerUp never fires for a keyboard user.
  it('a keyboard change followed by blur still writes — no pointer event involved', () => {
    render(<ProgressSlider book={book(10)} />)
    const slider = screen.getByLabelText('Reading progress')

    fireEvent.change(slider, { target: { value: '55' } })
    fireEvent.blur(slider)
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith({ id: 'b1', patch: { progress: 55 } })
  })

  // And the reason it is not "drop onPointerUp": a drag must not wait for focus to leave, since the
  // component can unmount first and take the write with it.
  it('a drag alone writes without waiting for blur', () => {
    render(<ProgressSlider book={book(10)} />)
    const slider = screen.getByLabelText('Reading progress')

    fireEvent.change(slider, { target: { value: '70' } })
    fireEvent.pointerUp(slider)
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('releasing without moving the thumb writes nothing at all', () => {
    render(<ProgressSlider book={book(10)} />)
    const slider = screen.getByLabelText('Reading progress')

    fireEvent.pointerUp(slider)
    fireEvent.blur(slider)
    expect(mutate).not.toHaveBeenCalled()
  })

  it('two successive drags write once each, carrying their own value', () => {
    render(<ProgressSlider book={book(10)} />)
    const slider = screen.getByLabelText('Reading progress')

    fireEvent.change(slider, { target: { value: '30' } })
    fireEvent.pointerUp(slider)
    fireEvent.change(slider, { target: { value: '60' } })
    fireEvent.pointerUp(slider)

    expect(mutate).toHaveBeenCalledTimes(2)
    expect(mutate).toHaveBeenNthCalledWith(1, { id: 'b1', patch: { progress: 30 } })
    expect(mutate).toHaveBeenNthCalledWith(2, { id: 'b1', patch: { progress: 60 } })
  })
})
