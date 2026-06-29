import { APP_NAME } from '@reverie/core'

/** The master-brand wordmark: a small gold crescent (CSS, no raster) + the app name in the display
 *  serif. Used on the landing and the auth screen. Name comes from APP_NAME so a rename is one edit. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className ?? ''}`}>
      <span
        aria-hidden
        className="relative h-[18px] w-[18px] shrink-0 rounded-full"
        style={{
          background: 'var(--gold)',
          boxShadow: '0 0 14px color-mix(in srgb, var(--gold) 55%, transparent)',
        }}
      >
        {/* crescent: a bg-coloured disc nudged over the gold one */}
        <span
          className="absolute h-[14px] w-[14px] rounded-full"
          style={{ background: 'var(--bg0)', top: '1px', left: '5px' }}
        />
      </span>
      <span
        className="text-[19px] leading-none text-ink"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.2px' }}
      >
        {APP_NAME}
      </span>
    </span>
  )
}
