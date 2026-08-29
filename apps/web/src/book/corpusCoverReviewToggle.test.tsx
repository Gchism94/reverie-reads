import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CorpusCoverReviewToggle } from './BookDetailRoute'

describe('CorpusCoverReviewToggle', () => {
  it('starts off and publishes only after the administrator explicitly turns it on', () => {
    const review = vi.fn()
    render(
      <CorpusCoverReviewToggle reviewed={false} loading={false} saving={false} onReview={review} />,
    )

    const toggle = screen.getByRole('switch', { name: 'Review personal cover for corpus' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(/Off until an administrator explicitly reviews/)).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(review).toHaveBeenCalledOnce()
  })

  it('shows the reviewed state as an accepted one-way corpus option', () => {
    const review = vi.fn()
    render(<CorpusCoverReviewToggle reviewed loading={false} saving={false} onReview={review} />)

    const toggle = screen.getByRole('switch', { name: 'Personal cover reviewed for corpus' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(toggle).toBeDisabled()
    expect(screen.getByText(/available as a shared cover option/)).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(review).not.toHaveBeenCalled()
  })

  it('cannot submit while review state is loading or a publication is pending', () => {
    const review = vi.fn()
    const { rerender } = render(
      <CorpusCoverReviewToggle reviewed={false} loading saving={false} onReview={review} />,
    )
    expect(screen.getByRole('switch')).toBeDisabled()

    rerender(<CorpusCoverReviewToggle reviewed={false} loading={false} saving onReview={review} />)
    expect(screen.getByRole('switch')).toBeDisabled()
  })
})
