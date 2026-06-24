import { ownedCaption, type Owned } from '@reverie/core'
import { Switch } from '../components/Switch'

/** "Your copies" — independent per-format ownership toggles with a live caption. */
export function OwnedCopies({ owned, onChange }: { owned: Owned; onChange: (next: Owned) => void }) {
  const physicalOn = owned.physical !== false
  const physicalKind = typeof owned.physical === 'string' ? owned.physical : null

  return (
    <div className="rounded-2xl border border-line p-4" style={{ background: 'var(--card)' }}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted">Your copies</span>
      </div>
      <p className="mb-3 text-[13px] text-ink">{ownedCaption(owned)}</p>

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
    </div>
  )
}
