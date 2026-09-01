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
        status={null}
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

  it('keeps the active phase and final result beside the administrator control', () => {
    const { rerender } = render(
      <CorpusCompleteControl
        completing
        progress={{
          scanned: 25,
          total: 100,
          filled: 3,
          recoveryScanned: 50,
          phase: 'recovering',
        }}
        eligibleCount={100}
        status={null}
        onRun={vi.fn()}
        onStop={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'Recovering household covers in small batches · 50 cover sources checked · 25 of 100 shared works classified.',
    )

    rerender(
      <CorpusCompleteControl
        completing={false}
        progress={null}
        eligibleCount={75}
        status="Corpus sweep paused — cover recovery will resume."
        onRun={vi.fn()}
        onStop={vi.fn()}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Corpus sweep paused — cover recovery will resume.',
    )
  })
})
