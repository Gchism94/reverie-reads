import { useId } from 'react'
import {
  CONTRIBUTOR_ROLES,
  ROLE_LABELS,
  renumber,
  type Contributor,
  type ContributorRole,
} from '@reverie/core'

/**
 * Edit a book's ordered contributor list: add / remove / reorder (accessible up-down buttons) /
 * set role, with name autocomplete against existing authors. Controlled — the parent owns the list
 * and persists it via set_book_contributors. (Drag reorder is a later refinement; up/down keeps it
 * keyboard-accessible.)
 */
export function ContributorEditor({
  value,
  onChange,
  suggestions = [],
}: {
  value: Contributor[]
  onChange: (next: Contributor[]) => void
  suggestions?: string[]
}) {
  const listId = useId()
  const rows = renumber(value)

  const update = (i: number, patch: Partial<Contributor>) =>
    onChange(renumber(rows.map((c, idx) => (idx === i ? { ...c, ...patch } : c))))
  const remove = (i: number) => onChange(renumber(rows.filter((_, idx) => idx !== i)))
  const add = () =>
    onChange(
      renumber([...rows, { name: '', role: 'author' as ContributorRole, position: rows.length }]),
    )
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    onChange(renumber(next))
  }

  const fieldClass = 'h-9 rounded-lg border border-line px-2 text-[13px] text-ink outline-none'
  const fieldStyle = { background: 'var(--field)' } as const

  return (
    <div className="space-y-2">
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {rows.map((c, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={c.name}
            onChange={(e) => update(i, { name: e.target.value })}
            list={listId}
            placeholder="Name"
            aria-label={`Contributor ${i + 1} name`}
            className={`${fieldClass} min-w-0 flex-1`}
            style={fieldStyle}
          />
          <select
            value={c.role}
            onChange={(e) => update(i, { role: e.target.value as ContributorRole })}
            aria-label={`Contributor ${i + 1} role`}
            className={`${fieldClass} flex-none`}
            style={fieldStyle}
          >
            {CONTRIBUTOR_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => move(i, -1)}
            disabled={i === 0}
            aria-label={`Move ${c.name || `contributor ${i + 1}`} up`}
            className="flex h-9 w-7 flex-none items-center justify-center rounded-lg border border-line text-ink disabled:opacity-30"
            style={fieldStyle}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => move(i, 1)}
            disabled={i === rows.length - 1}
            aria-label={`Move ${c.name || `contributor ${i + 1}`} down`}
            className="flex h-9 w-7 flex-none items-center justify-center rounded-lg border border-line text-ink disabled:opacity-30"
            style={fieldStyle}
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label={`Remove ${c.name || `contributor ${i + 1}`}`}
            className="flex h-9 w-7 flex-none items-center justify-center rounded-lg border border-line text-muted hover:text-ink"
            style={fieldStyle}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink"
        style={fieldStyle}
      >
        ＋ Add contributor
      </button>
    </div>
  )
}
