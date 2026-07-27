import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChunkBoundary } from './ChunkBoundary'

// A failed lazy import used to unwind to the app-wide boundary and replace a page that had already
// rendered with "Something went wrong!". Offline that is exactly what happened to the landing.
function Explodes(): never {
  throw new Error('Failed to fetch dynamically imported module: /assets/below-fold-XYZ.js')
}

describe('ChunkBoundary', () => {
  it('keeps the rest of the page when a chunk cannot be fetched', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <div>
        <h1>A reading life, beautifully kept.</h1>
        <ChunkBoundary label="test">
          <Explodes />
        </ChunkBoundary>
      </div>,
    )
    // The above-fold content survives — that is the whole point.
    expect(screen.getByText('A reading life, beautifully kept.')).toBeInTheDocument()
    spy.mockRestore()
  })

  it('renders a fallback when given one, and nothing when not', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ChunkBoundary label="test" fallback={<p>more below, once you’re back online</p>}>
        <Explodes />
      </ChunkBoundary>,
    )
    expect(screen.getByText('more below, once you’re back online')).toBeInTheDocument()
    spy.mockRestore()
  })

  it('renders children untouched when nothing fails', () => {
    render(
      <ChunkBoundary label="test">
        <p>below the fold</p>
      </ChunkBoundary>,
    )
    expect(screen.getByText('below the fold')).toBeInTheDocument()
  })
})
