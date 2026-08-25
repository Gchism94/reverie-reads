import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HouseholdBook } from '../data/household'
import { HouseholdBookCard, HouseholdBookDetail, LibraryScopeControl } from './HouseholdLibrary'

const book = (ownerId: string, ownerName: string): HouseholdBook => ({
  id: `book-${ownerId}`,
  ownerId,
  ownerName,
  title: 'Duplicate Title',
  author: 'Quill Marrowbane',
  cover: 'https://covers.example.test/duplicate.jpg',
  coverThumb: '',
  coverColor: '',
  series: 'Household Cycle',
  position: 2,
  seriesCount: 3,
  seriesStatus: 'ongoing',
  primaryGenre: 'literary',
  genres: [],
  subgenre: '',
  subgenres: [],
  isbn: '9780000000001',
  ownership: 'owned',
  borrowed: false,
  wishlist: true,
  ownedPhysical: 'hardcover',
  ownedEbook: true,
  ownedAudiobook: false,
  bookFormat: '',
  publicationYear: 2026,
  publicationMonth: null,
  publicationDay: null,
  addedAt: '2026-08-24T00:00:00Z',
})

describe('household Library presentation', () => {
  it('keeps duplicate titles distinguishable by textual member identity', () => {
    const openA = vi.fn()
    const openB = vi.fn()
    render(
      <>
        <HouseholdBookCard
          book={book('reader-a', 'Avery')}
          currentReaderId="reader-a"
          onOpen={openA}
        />
        <HouseholdBookCard
          book={book('reader-b', 'Blake')}
          currentReaderId="reader-a"
          onOpen={openB}
        />
      </>,
    )

    expect(screen.getByText("Avery (you)'s library")).toBeInTheDocument()
    expect(screen.getByText("Blake's library")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /from Blake/ }))
    expect(openB).toHaveBeenCalledOnce()
    expect(openA).not.toHaveBeenCalled()
  })

  it('renders shared details without any personal mutation or full-page affordance', () => {
    render(<HouseholdBookDetail book={book('reader-a', 'Avery')} currentReaderId="reader-a" />)

    expect(screen.getByText("From Avery (you)'s personal library")).toBeInTheDocument()
    expect(screen.getByText('Read-only household view')).toBeInTheDocument()
    expect(screen.getByText('Owned')).toBeInTheDocument()
    expect(screen.getByText('Wishlist')).toBeInTheDocument()
    expect(screen.getByText('Hardcover')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /full page/i })).not.toBeInTheDocument()
    expect(
      screen.queryByText(/rating|favourite|favorite|read status|notes|progress/i),
    ).not.toBeInTheDocument()
  })

  it('uses a real pressed-state scope control', () => {
    const onChange = vi.fn()
    render(<LibraryScopeControl scope="personal" onChange={onChange} />)

    expect(screen.getByRole('button', { name: 'Personal' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Household' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Household' }))
    expect(onChange).toHaveBeenCalledWith('household')
  })
})
