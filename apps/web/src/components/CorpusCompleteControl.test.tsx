import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CorpusCompleteControl } from './CorpusCompleteControl'

describe('CorpusCompleteControl', () => {
  it('still runs personal-cover recovery when no metadata candidates are waiting', () => {
    const run = vi.fn()

    render(
      <CorpusCompleteControl
        completing={false}
        progress={null}
        eligibleCount={0}
        onRun={run}
        onStop={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', {
      name: '✨ Complete shared corpus & series info',
    })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(run).toHaveBeenCalledOnce()
  })
})
