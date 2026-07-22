import { OWNERSHIP_VALUES, isPossessed, ownedCaption, type Book, type BookOwnership, type Owned } from '@reverie/core'
import { Switch } from '../components/Switch'
import { useVoice } from '../skin/labels'
import { OWNERSHIP_LABELS } from '../library/constants'

/**
 * "Your copies" — possession lives here. A four-state control (docs/task-ownership-v2.md) sets how
 * you have the book — owned / borrowed / wishlist / not set — in the active skin's voice. The
 * per-format switches describe WHICH copies a book IN HAND has, so they show for owned AND borrowed
 * (you can record the format of a book you read but don't own) and hide for wishlist/unset. Reading
 * status, shelves, ratings, and notes never depend on any of this.
 */
export function OwnedCopies({
  ownership,
  owned,
  onChange,
  onOwnershipChange,
}: {
  ownership: Book['ownership']
  owned: Owned
  onChange: (next: Owned) => void
  onOwnershipChange: (next: BookOwnership) => void
}) {
  const voice = useVoice()
  const possessed = isPossessed({ ownership })
  const physicalOn = owned.physical !== false
  const physicalKind = typeof owned.physical === 'string' ? owned.physical : null

  // Plain word is the button (legible at a glance); the skin voice is the flavor subtitle beneath it.
  const voiceSub: Record<BookOwnership, string> = {
    owned: voice.ownIt,
    borrowed: voice.borrowedIt,
    wishlist: voice.wantIt,
    unset: voice.unsetIt,
  }
  const caption: Record<BookOwnership, string> = {
    owned: ownedCaption(owned, 'Owned'),
    borrowed: ownedCaption(owned, 'Borrowed'),
    wishlist: 'A book you want, not one you have yet — mark it owned or borrowed when it comes home.',
    unset: 'Possession not set — record it as owned, borrowed, or a wishlist want whenever you like.',
  }

  return (
    <div className="rounded-2xl border border-line p-4" style={{ background: 'var(--card)' }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted">Your copies</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Ownership">
        {OWNERSHIP_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={ownership === value}
            aria-label={OWNERSHIP_LABELS[value]}
            onClick={() => onOwnershipChange(value)}
            className="skin-control border px-3 py-1.5 text-center leading-tight"
            style={
              ownership === value
                ? { background: 'var(--accent-fill)', color: 'var(--on-primary)', borderColor: 'transparent' }
                : { background: 'var(--field)', color: 'var(--muted)', borderColor: 'var(--line)' }
            }
          >
            <span className="block text-[12px] font-semibold">{OWNERSHIP_LABELS[value]}</span>
            <span className="block text-[9.5px] font-normal italic">{voiceSub[value]}</span>
          </button>
        ))}
      </div>
      <p className="mb-3 text-[13px] text-ink">{caption[ownership]}</p>

      {possessed && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] text-ink">📖 Physical</span>
            <Switch
              checked={physicalOn}
              onChange={(on) => onChange({ ...owned, physical: on ? (physicalKind ?? 'paperback') : false })}
              label="Have a physical copy"
            />
          </div>
          {physicalOn && (
            <div className="-mt-1 flex gap-1.5 pl-6">
              {(['paperback', 'hardcover'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={physicalKind === k}
                  onClick={() => onChange({ ...owned, physical: k })}
                  className="rounded-full border px-2.5 py-1 text-[11.5px] font-semibold capitalize"
                  style={
                    physicalKind === k
                      ? { background: 'var(--accent-fill)', color: 'var(--on-primary)', borderColor: 'transparent' }
                      : { background: 'var(--field)', color: 'var(--muted)', borderColor: 'var(--line)' }
                  }
                >
                  {k}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] text-ink">📱 Ebook</span>
            <Switch checked={owned.ebook} onChange={(on) => onChange({ ...owned, ebook: on })} label="Have an ebook" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] text-ink">🎧 Audiobook</span>
            <Switch checked={owned.audiobook} onChange={(on) => onChange({ ...owned, audiobook: on })} label="Have an audiobook" />
          </div>
        </div>
      )}
    </div>
  )
}
