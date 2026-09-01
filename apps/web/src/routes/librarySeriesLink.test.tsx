import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  createRoute: (options: unknown) => options,
  Link: ({
    to,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))
vi.mock('./RootRoute', () => ({ rootRoute: {} }))
vi.mock('../data/books', () => ({
  useBooks: () => ({ data: [] }),
  useUpdateBook: () => ({ mutate: vi.fn() }),
}))
vi.mock('../lib/supabase', () => ({ supabase: {} }))

const { LibraryHeader } = await import('./LibraryRoute')
const { Toolbar } = await import('../library/Toolbar')

describe('Library stays book-focused', () => {
  it('has no Grid/Series mode switch and offers a direct Series destination', () => {
    render(
      <>
        <LibraryHeader scope="personal" readout="12 books" />
        <Toolbar />
      </>,
    )

    expect(screen.queryByRole('group', { name: 'View mode' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Grid$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Series$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse series' })).toHaveAttribute('href', '/series')
  })
})
