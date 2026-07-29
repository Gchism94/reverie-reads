import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { STATE_PILL_LABEL, STATE_PILL_TOKENS, type Book } from '@reverie/core'
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

/** The pill element for a state, found by its visible word.
 *
 *  Exact by design, and it works because RTL's getNodeText concatenates only DIRECT text-node
 *  children — the accent glyph lives in a nested span, so the pill's own text is just the word. */
const pillFor = (word: 'DNF' | 'Borrowed' | 'Read') => screen.getByText(word).closest('span')

describe('state pills render solid, never a scrim over cover art', () => {
  // EVERY pill the card can render, not a subset. A guard covering two of three leaves the same
  // hole in a new place — which is exactly how the Read pill stayed translucent while the other
  // two were converted.
  const CASES: { pill: 'DNF' | 'Borrowed' | 'Read'; book: Book }[] = [
    { pill: 'DNF', book: book({ readStatus: 'DNF' }) },
    { pill: 'Borrowed', book: book({ ownership: 'unowned', borrowed: true }) },
    { pill: 'Read', book: book({ readStatus: 'Read' }) },
  ]

  for (const { pill, book: b } of CASES) {
    it(`the ${pill} pill sits on the shared solid surface`, () => {
      render(card(b))
      const el = pillFor(pill)
      expect(el, `${pill} pill did not render`).toBeTruthy()
      // The literal token, not a colour — reverting to rgba()/transparent fails here.
      expect(el!.style.background).toBe(STATE_PILL_TOKENS.surface)
      expect(el!.style.background).not.toMatch(/rgba?\(|transparent/)
      expect(el!.style.color).toBe(STATE_PILL_TOKENS.label)
    })
  }

  it('covers every pill kind the model defines, so a new one cannot be added untested', () => {
    // Keyed off the kind union's own label map: adding a fourth pill without adding a case here
    // fails, rather than silently shipping a fourth translucent mark.
    const covered = CASES.map((c) => c.pill).sort()
    const defined = Object.values(STATE_PILL_LABEL).sort()
    expect(covered).toEqual(defined)
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

  it('Read stays announceable in place, since no control name carries it', () => {
    // borrowed and DNF are aria-hidden because the card's NAME repeats them. "Read" is in no name,
    // so hiding its pill would delete the only channel a screen-reader user has for it.
    render(card(book({ readStatus: 'Read' })))
    expect(pillFor('Read')!.getAttribute('aria-hidden')).toBeNull()
  })

  it('borrowed and DNF pills ARE hidden, because the name already says them', () => {
    render(card(book({ readStatus: 'DNF', ownership: 'unowned', borrowed: true })))
    expect(pillFor('DNF')!.getAttribute('aria-hidden')).toBe('true')
    expect(pillFor('Borrowed')!.getAttribute('aria-hidden')).toBe('true')
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
