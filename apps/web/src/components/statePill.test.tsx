import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { STATE_PILL_TOKENS, type Book } from '@reverie/core'
import { CoverCard } from './CoverCard'
import { SpineShelf } from './SpineShelf'

// The component half of the state-pill guard.
//
// `statePill.contrast.test.ts` proves the TOKEN PAIR is AA across all nine skins in both modes. It
// cannot prove a component actually uses that pair — a card that quietly inlines `rgba(0,0,0,0.45)`
// leaves the contrast test green while shipping the exact defect the branch removes. This closes
// that gap: it asserts the rendered pill carries the solid token and no translucent scrim, and that
// the state reaches the enclosing control's accessible name rather than floating as loose text.

const book = (over: Partial<Book>): Book => ({
  id: 'b1',
  title: 'A Probe',
  first: 'Nell',
  last: 'Marrow',
  contributors: [],
  series: '',
  position: '',
  seriesCount: null,
  status: 'standalone',
  genre: 'fantasy',
  subgenre: '',
  subgenres: [],
  genres: [],
  tags: [],
  tropes: [],
  moods: [],
  intensity: null,
  cover: '',
  pages: null,
  isbn: '',
  fave: false,
  ownership: 'owned',
  borrowed: false,
  wishlist: false,
  owned: { physical: false, ebook: false, audiobook: false },
  format: '',
  rating: 0,
  readStatus: 'unset',
  source: '',
  pub: { y: null, m: null, d: null },
  reads: [],
  plan: null,
  progress: 0,
  addedTs: 0,
  ...over,
})

const noop = () => {}
const card = (b: Book) => <CoverCard book={b} onOpen={noop} onToggleFave={noop} />

/** The pill element for a state, found by its visible word. */
const pillFor = (word: 'DNF' | 'Borrowed') => screen.getByText(word).closest('span')

describe('state pills render solid, never a scrim over cover art', () => {
  it('the DNF pill uses the shared solid surface', () => {
    render(card(book({ readStatus: 'DNF' })))
    const pill = pillFor('DNF')
    expect(pill).toBeTruthy()
    // The literal token, not a colour — reverting to rgba()/transparent fails here.
    expect(pill!.style.background).toBe(STATE_PILL_TOKENS.surface)
    expect(pill!.style.background).not.toMatch(/rgba?\(|transparent/)
    expect(pill!.style.color).toBe(STATE_PILL_TOKENS.label)
  })

  it('the borrowed pill uses the same solid surface — it was translucent before this branch', () => {
    render(card(book({ ownership: 'unowned', borrowed: true })))
    const pill = pillFor('Borrowed')
    expect(pill).toBeTruthy()
    expect(pill!.style.background).toBe(STATE_PILL_TOKENS.surface)
    expect(pill!.style.background).not.toMatch(/rgba?\(|transparent/)
  })
})

describe('state reaches the accessible name, not only the eye', () => {
  it('a DNF book names the state on the card control', () => {
    render(card(book({ readStatus: 'DNF' })))
    expect(screen.getByRole('button', { name: 'Open A Probe, did not finish' })).toBeTruthy()
  })

  it('a borrowed book names the state on the card control', () => {
    render(card(book({ ownership: 'unowned', borrowed: true })))
    expect(screen.getByRole('button', { name: 'Open A Probe, borrowed' })).toBeTruthy()
  })

  it('a book holding both names them in the fixed order, DNF first', () => {
    render(card(book({ readStatus: 'DNF', ownership: 'unowned', borrowed: true })))
    expect(
      screen.getByRole('button', { name: 'Open A Probe, did not finish, borrowed' }),
    ).toBeTruthy()
  })

  it('a book holding neither state adds nothing', () => {
    render(card(book({ readStatus: 'Read' })))
    expect(screen.getByRole('button', { name: 'Open A Probe' })).toBeTruthy()
  })

  it('spines carry the state in the name — the load-bearing channel at 26px', () => {
    // A spine cannot hold a text pill, so this IS the information. The edge marker only helps
    // someone who can already see the shelf.
    render(
      <SpineShelf
        books={[book({ id: 's1', title: 'Spine Probe', readStatus: 'DNF' })]}
        onOpen={noop}
      />,
    )
    // The first spine is revealed by default (activeId), so it reads as "Open".
    expect(screen.getByRole('button', { name: /Spine Probe, did not finish/ })).toBeTruthy()
  })
})

describe('the read-status slot holds one state at a time', () => {
  it('DNF replaces Read rather than stacking with it', () => {
    // A DNF book can carry a read-log row; deferring to isBookRead would make it wear "Read"
    // against its own recorded status.
    render(
      card(
        book({
          readStatus: 'DNF',
          reads: [{ date: '2026-01-01', format: '', rating: 0, notes: '' }],
        }),
      ),
    )
    expect(screen.getByText('DNF')).toBeTruthy()
    expect(screen.queryByText('Read')).toBeNull()
  })

  it('a finished book still shows Read', () => {
    render(card(book({ readStatus: 'Read' })))
    expect(screen.getByText('Read')).toBeTruthy()
    expect(screen.queryByText('DNF')).toBeNull()
  })
})
