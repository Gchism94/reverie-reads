import { useMemo, useState } from 'react'
import { resolveMood, type Book } from '@reverie/core'
import { MoodChip } from './MoodChip'
import { useAssignMood, useCreatePersonalMood, useMoods, useUnassignMood } from '../data/moods'

/**
 * The mood assignment control (docs/archive/task-mood.md §2) — a small, quick multi-select the reader uses
 * wherever they record an impression (edit form, book detail, the just-finished sheet). Tap a mood
 * to assign it, tap again to remove. Inline personal creation resolves against canon first so a
 * near-match offers the canonical instead of duplicating. Reader-assigned ONLY — nothing here reads
 * tags/subgenre/tropes; there is no suggestion and no derivation. Absence is a valid, quiet state.
 *
 * Inline (not a modal), so it embeds directly in the edit dialog and the just-finished sheet, and
 * inside a Modal on book detail — one component, every surface.
 */
export function MoodPicker({ book }: { book: Book }) {
  const { data: moods } = useMoods()
  const assign = useAssignMood()
  const unassign = useUnassignMood()
  const createPersonal = useCreatePersonalMood()

  const [q, setQ] = useState('')
  const [note, setNote] = useState<string | null>(null)

  const assigned = useMemo(() => new Set(book.moods.map((m) => m.id)), [book.moods])
  const exactExists = (moods ?? []).some((m) => m.name.toLowerCase() === q.trim().toLowerCase())

  const toggle = (moodId: string) => {
    setNote(null)
    if (assigned.has(moodId)) unassign.mutate({ bookId: book.id, moodId })
    else assign.mutate({ bookId: book.id, moodId })
  }

  const createDraft = () => {
    const raw = q.trim()
    if (!raw) return
    setNote(null)
    const hit = resolveMood(raw, moods ?? [])
    if (hit) {
      // near-match: offer the canonical instead of coining a duplicate
      if (!assigned.has(hit.id)) assign.mutate({ bookId: book.id, moodId: hit.id })
      setNote(`Filed under ${hit.name} — the shelf already knows this feeling.`)
      setQ('')
      return
    }
    createPersonal.mutate(
      { name: raw },
      {
        onSuccess: (m) => {
          assign.mutate({ bookId: book.id, moodId: m.id })
          setNote(`${m.name} is yours now — it lives in every mood picker from here on.`)
          setQ('')
        },
      },
    )
  }

  // assigned moods lead (the reader's picks first), then the rest of the vocabulary, alphabetical.
  const ordered = useMemo(() => {
    const list = [...(moods ?? [])]
    return list.sort((a, b) => {
      const aa = assigned.has(a.id) ? 0 : 1
      const bb = assigned.has(b.id) ? 0 : 1
      return aa - bb || a.name.localeCompare(b.name)
    })
  }, [moods, assigned])

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {ordered.map((m) => (
          <MoodChip
            key={m.id}
            name={m.name}
            active={assigned.has(m.id)}
            onClick={() => toggle(m.id)}
            title={m.personal ? `${m.name} (yours)` : m.name}
          />
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              createDraft()
            }
          }}
          placeholder="Name your own mood…"
          aria-label="Name your own mood"
          className="h-9 w-full rounded-xl border border-line px-3 text-[13.5px] text-ink outline-none"
          style={{ background: 'var(--field)' }}
        />
        {q.trim() && !exactExists && (
          <button
            type="button"
            onClick={createDraft}
            className="h-9 flex-none rounded-full border border-dashed border-line px-3 text-[12.5px] font-semibold text-ink"
            style={{ background: 'var(--chip)' }}
          >
            ＋ Add
          </button>
        )}
      </div>
      {note && (
        <p className="mt-2 text-[12.5px]" style={{ color: 'var(--accent-ink)' }}>
          {note}
        </p>
      )}
    </div>
  )
}
