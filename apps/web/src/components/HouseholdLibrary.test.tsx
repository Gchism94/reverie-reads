import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HouseholdBook } from '../data/household'
import { HouseholdBookCard, HouseholdBookDetail, LibraryScopeControl } from './HouseholdLibrary'

const book = (ownerId: string, ownerName: string): HouseholdBook => ({
  id: `book-${ownerId}`,
  title: 'Duplicate Title',
  author: 'Quill Marrowbane',
  cover: 'https://covers.example.test/duplicate.jpg',
  coverColor: '',
  coverOptions: [],
  series: 'Household Cycle',
  position: 2,
  seriesCount: 3,
  seriesStatus: 'ongoing',
  primaryGenre: 'literary',
  genres: [],
  subgenre: '',
  subgenres: [],
  isbns: ['9780000000001'],
  owners: [
    {
      bookId: `copy-${ownerId}`,
      userId: ownerId,
      displayName: ownerName,
      ownership: 'owned',
      borrowed: false,
      ownedPhysical: 'hardcover',
      ownedEbook: true,
      ownedAudiobook: false,
      bookFormat: '',
      shared: false,
    },
  ],
  householdTags: [],
  householdTropes: [],
  publicationYear: 2026,
  publicationMonth: null,
  publicationDay: null,
  addedAt: '2026-08-24T00:00:00Z',
})

describe('household Library presentation', () => {
  it('names the active personal copies while keeping household works distinct', () => {
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

    expect(screen.getAllByText('Avery (you)')).not.toHaveLength(0)
    expect(screen.getAllByText('Blake')).not.toHaveLength(0)
    fireEvent.click(screen.getAllByRole('button', { name: /in the household library/ })[1]!)
    expect(openB).toHaveBeenCalledOnce()
    expect(openA).not.toHaveBeenCalled()
  })

  it('renders corpus details and explains the independent household lifecycle', () => {
    render(<HouseholdBookDetail book={book('reader-a', 'Avery')} currentReaderId="reader-a" />)

    expect(screen.getByText('In your household library')).toBeInTheDocument()
    expect(screen.getByText('Active copies: Avery (you)')).toBeInTheDocument()
    expect(screen.getByText(/Owned · Hardcover · Ebook/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /full page/i })).not.toBeInTheDocument()
    expect(
      screen.queryByText(/rating|favourite|favorite|read status|notes|progress/i),
    ).not.toBeInTheDocument()
  })

  it('renders a trope-only household overlay in the detail DOM', () => {
    const tropeOnly = {
      ...book('reader-a', 'Avery'),
      householdTags: [],
      householdTropes: [{ name: 'Only One Bed', emphasis: 'pinned' as const }],
    }
    render(<HouseholdBookDetail book={tropeOnly} currentReaderId="reader-a" />)

    expect(screen.getByText('Shared details')).toBeInTheDocument()
    expect(screen.getByText(/Only One Bed/)).toBeInTheDocument()
  })

  it('offers an explicit corpus-trope action only when the administrator handler is present', async () => {
    const add = vi.fn().mockResolvedValue(undefined)
    render(
      <HouseholdBookDetail
        book={book('reader-a', 'Avery')}
        currentReaderId="reader-a"
        onAddCorpusTrope={add}
      />,
    )

    fireEvent.change(screen.getByLabelText('Add a corpus trope'), {
      target: { value: 'Quiet competence' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(add).toHaveBeenCalledWith('Quiet competence'))
    await waitFor(() => expect(screen.getByLabelText('Add a corpus trope')).toHaveValue(''))
  })

  it('labels corpus editing as shared and leaves personal adoption explicit', async () => {
    const edit = vi.fn().mockResolvedValue(undefined)
    render(
      <HouseholdBookDetail
        book={book('reader-a', 'Avery')}
        currentReaderId="reader-a"
        onEditCorpus={edit}
      />,
    )

    fireEvent.click(screen.getByText('Edit shared cover, series, genre, and publication'))
    expect(screen.getByText(/Personal copies keep their existing details/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Shared primary genre'), {
      target: { value: 'mystery' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save shared details' }))

    await waitFor(() =>
      expect(edit).toHaveBeenCalledWith(
        expect.objectContaining({
          series: 'Household Cycle',
          position: 2,
          seriesCount: 3,
          seriesStatus: 'ongoing',
          genre: 'mystery',
          genres: ['mystery'],
          publicationYear: 2026,
        }),
      ),
    )
  })

  it('refuses invalid shared numeric metadata before invoking the corpus writer', () => {
    const edit = vi.fn().mockResolvedValue(undefined)
    render(
      <HouseholdBookDetail
        book={book('reader-a', 'Avery')}
        currentReaderId="reader-a"
        onEditCorpus={edit}
      />,
    )

    fireEvent.click(screen.getByText('Edit shared cover, series, genre, and publication'))
    fireEvent.change(screen.getByLabelText('Shared publication month'), {
      target: { value: '13' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save shared details' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Month must be 12 or less.')
    expect(edit).not.toHaveBeenCalled()
  })

  it('lets an authorized editor select an existing reviewed shared cover', async () => {
    const edit = vi.fn().mockResolvedValue(undefined)
    const first = 'https://covers.example.test/first.jpg'
    const second = 'https://covers.example.test/second.jpg'
    render(
      <HouseholdBookDetail
        book={{
          ...book('reader-a', 'Avery'),
          cover: first,
          coverOptions: [
            { url: first, source: 'hardcover', sourceUrl: first },
            { url: second, source: 'google', sourceUrl: second },
          ],
        }}
        currentReaderId="reader-a"
        onEditCorpus={edit}
      />,
    )

    fireEvent.click(screen.getByText('Edit shared cover, series, genre, and publication'))
    const secondChoice = screen.getByRole('radio', { name: 'Google cover 2' })
    fireEvent.click(secondChoice)
    expect(secondChoice).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Hardcover cover 1' })).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Save shared details' }))

    await waitFor(() =>
      expect(edit).toHaveBeenCalledWith(expect.objectContaining({ coverUrl: second })),
    )
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
