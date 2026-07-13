import { ownedCaption, type Book, type Owned } from '@reverie/core'
import { Switch } from '../components/Switch'

/**
 * "Your copies" — possession lives here. One tap flips owned ⇄ wishlist (`ownership`); the
 * per-format switches describe WHICH copies an owned book has, so they hide for a wishlist book
 * (formats you don't have yet aren't a thing to toggle). Reading status, shelves, ratings, and
 * notes never depend on any of this — library books and borrowed reads exist.
 */
export function OwnedCopies({
  ownership,
  owned,
  onChange,
  onOwnershipToggle,
}: {
  ownership: Book['ownership']
  owned: Owned
  onChange: (next: Owned) => void
  onOwnershipToggle: () => void
}) {
  const unowned = ownership === 'unowned'
  const physicalOn = owned.physical !== false
  const physicalKind = typeof owned.physical === 'string' ? owned.physical : null

  return (
    <div className="rounded-2xl border border-line p-4" style={{ background: 'var(--card)' }}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted">Your copies</span>
        <button
          type="button"
          onClick={onOwnershipToggle}
          aria-pressed={!unowned}
          className="rounded-full border px-2.5 py-1 text-[11.5px] font-semibold"
          style={
            unowned
              ? { background: 'var(--chip)', color: 'var(--muted)', borderColor: 'var(--line)', borderStyle: 'dashed' }
              : { background: 'var(--accent-fill)', color: 'var(--on-primary)', borderColor: 'transparent' }
          }
        >
          {unowned ? '⊹ Wishlist' : 'Owned'}
        </button>
      </div>
      <p className="mb-3 text-[13px] text-ink">
        {unowned ? 'A book you want, not one you have yet — tap Wishlist when it comes home.' : ownedCaption(owned)}
      </p>

      {!unowned && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] text-ink">📖 Physical</span>
            <Switch
              checked={physicalOn}
              onChange={(on) => onChange({ ...owned, physical: on ? (physicalKind ?? 'paperback') : false })}
              label="Own a physical copy"
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
            <Switch checked={owned.ebook} onChange={(on) => onChange({ ...owned, ebook: on })} label="Own an ebook" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] text-ink">🎧 Audiobook</span>
            <Switch checked={owned.audiobook} onChange={(on) => onChange({ ...owned, audiobook: on })} label="Own an audiobook" />
          </div>
        </div>
      )}
    </div>
  )
}
