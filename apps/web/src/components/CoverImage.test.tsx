import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CoverImage } from './CoverImage'
import { markCoverBroken } from '../data/brokenCovers'
vi.mock('../data/brokenCovers', () => ({ markCoverBroken: vi.fn() }))
beforeEach(() => vi.clearAllMocks())
const book = {
  id: 'guest-private',
  title: 'A visitor-entered title',
  cover: 'https://example.com/missing.jpg',
}

describe('cover failure in temporary libraries', () => {
  it('shows the skin fallback and informs its card without reporting the visitor title', () => {
    const onExhausted = vi.fn()
    const { container } = render(
      <CoverImage book={book} reportErrors={false} onExhausted={onExhausted} />,
    )
    fireEvent.error(container.querySelector('img')!)
    expect(
      screen.getByRole('img', { name: /A visitor-entered title.*placeholder/ }),
    ).toBeInTheDocument()
    expect(onExhausted).toHaveBeenCalledOnce()
    expect(markCoverBroken).not.toHaveBeenCalled()
  })
  it('preserves normal cover reporting outside the guest experience', () => {
    const { container } = render(<CoverImage book={book} />)
    fireEvent.error(container.querySelector('img')!)
    expect(markCoverBroken).toHaveBeenCalledWith(
      expect.objectContaining({ id: book.id, title: book.title }),
    )
  })
})
