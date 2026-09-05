import { useRef, useState } from 'react'
import { beginReadingPatch, nextReadCandidates, type NextReadScope } from '@reverie/core'
import { NextReadCardView } from '../../components/NextReadCardView'
import { SAMPLE_LIBRARY } from './sampleLibrary'

export function NextReadDemo() {
  const heading = useRef<HTMLHeadingElement>(null)
  const [books, setBooks] = useState(() => [...SAMPLE_LIBRARY])
  const [scope, setScope] = useState<NextReadScope>('available')
  const [saved, setSaved] = useState<string[]>([])
  const [notice, setNotice] = useState('Try saving a book or starting a read.')
  const picks = nextReadCandidates(books, { scope })
  const reading = books.filter((book) => book.readStatus === 'Reading')

  function reset() {
    setBooks([...SAMPLE_LIBRARY])
    setSaved([])
    setScope('available')
    setNotice('Sample library reset. Try another book.')
  }

  return (
    <section id="try-next-read" aria-labelledby="sample-next-read" className="scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
          Try a sample library
        </p>
        <button
          type="button"
          onClick={reset}
          className="min-h-11 px-2 text-sm font-semibold text-ink underline underline-offset-4"
        >
          Reset sample
        </button>
      </div>
      <div className="mb-5 mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            ref={heading}
            tabIndex={-1}
            id="sample-next-read"
            className="text-3xl font-semibold leading-[1.2] text-ink"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            A place to start
          </h2>
          <p
            id="sample-scope-help"
            className="mt-2 max-w-[45ch] text-sm leading-relaxed text-muted"
          >
            {scope === 'available'
              ? 'Start with the books you own or have borrowed.'
              : 'Explore the books you want to get.'}
          </p>
        </div>
        <label className="text-sm font-semibold text-ink">
          Choose from
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as NextReadScope)}
            aria-describedby="sample-scope-help"
            className="skin-control mt-2 block min-h-11 max-w-full border border-line bg-field px-3 text-sm text-ink"
          >
            <option value="available">Available to read</option>
            <option value="wishlist">Wishlist</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,245px),1fr))] gap-4">
        {picks.map((book) => (
          <NextReadCardView
            key={book.id}
            book={book}
            reason="From your personal library"
            onStart={() => {
              heading.current?.focus({ preventScroll: true })
              setBooks((current) =>
                current.map((item) =>
                  item.id === book.id ? { ...item, ...beginReadingPatch(item) } : item,
                ),
              )
              setNotice(
                `Started ${book.title} in this sample. Your active reads live on Home in Reverie.`,
              )
            }}
            onSave={() => {
              setSaved((current) => (current.includes(book.id) ? current : [...current, book.id]))
              setNotice(`Saved ${book.title} for later in this sample.`)
            }}
          />
        ))}
      </div>
      {picks.length === 0 && (
        <p className="rounded-xl border border-line p-5 text-sm text-ink">
          You’ve started every book here. Reset the sample to try again.
        </p>
      )}
      <div className="mt-5 border-t border-line pt-4 text-sm leading-relaxed text-muted">
        <p role="status" aria-live="polite" className="text-ink">
          {notice}
        </p>
        {reading.length > 0 && (
          <p className="mt-2">
            <strong className="text-ink">Reading now:</strong>{' '}
            {reading.map((book) => book.title).join(' · ')}
          </p>
        )}
        {saved.length > 0 && (
          <p className="mt-2">
            <strong className="text-ink">Saved for later:</strong>{' '}
            {books
              .filter((book) => saved.includes(book.id))
              .map((book) => book.title)
              .join(' · ')}
          </p>
        )}
        <p className="mt-3 text-xs">
          Fictional books. Changes stay in this sample and reset when you reload.
        </p>
      </div>
    </section>
  )
}
