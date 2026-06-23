import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from './ThemeToggle'
import { useTheme } from '../theme/useTheme'

describe('<ThemeToggle />', () => {
  beforeEach(() => {
    useTheme.getState().setTheme('nocturne')
  })

  it('shows the active theme and toggles to the other on click', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    expect(screen.getByRole('button', { name: /currently nocturne/i })).toBeInTheDocument()
    expect(document.documentElement.dataset.theme).toBe('nocturne')

    await user.click(screen.getByRole('button'))

    expect(document.documentElement.dataset.theme).toBe('dawn')
    expect(screen.getByRole('button', { name: /currently magnolia dawn/i })).toBeInTheDocument()
  })
})
