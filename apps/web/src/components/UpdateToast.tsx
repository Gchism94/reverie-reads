import { useEffect, useState } from 'react'
import { applyUpdate, initUpdateWatch } from '../lib/updates'

/** Quiet bottom toast when a newer deploy is live — refresh on the reader's terms, never forced
 *  mid-session. Sits above the mobile tab bar; regular bottom margin on desktop. */
export function UpdateToast() {
  const [ready, setReady] = useState(false)

  useEffect(() => initUpdateWatch(() => setReady(true)), [])

  if (!ready) return null
  return (
    <div
      role="status"
      className="fixed inset-x-0 z-[60] flex justify-center px-4 lg:bottom-6"
      style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }}
    >
      <div
        className="flex items-center gap-3 rounded-full border border-line py-2 pl-4 pr-2 text-[13px] text-ink"
        style={{
          background: 'linear-gradient(var(--card), var(--card)), var(--bg)',
          boxShadow: 'var(--shadow)',
        }}
      >
        A new version of Reverie is ready
        <button
          type="button"
          onClick={() => void applyUpdate()}
          className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold"
          style={{
            background: 'linear-gradient(135deg, var(--primary), var(--gold))',
            color: 'var(--on-primary)',
          }}
        >
          Refresh
        </button>
      </div>
    </div>
  )
}
