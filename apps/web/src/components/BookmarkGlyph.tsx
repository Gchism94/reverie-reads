/**
 * The PRIORITY mark — a bookmark ribbon. Marks-semantics contract (MVP polish): one glyph, one
 * meaning, every skin — ★ star = rating · this bookmark = priority read (Priority TBR) · ♥ heart
 * = favorite. Each skin colours/styles it through context (currentColor + the tag silhouette);
 * the MEANING never varies by skin. `filled` distinguishes "is priority" from "make priority".
 */
export function BookmarkGlyph({ filled = true, size = 11 }: { filled?: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size * (13 / 10)}
      viewBox="0 0 10 13"
      aria-hidden
      style={{ display: 'inline-block', verticalAlign: '-0.12em' }}
    >
      <path
        d="M1.5 1h7v11L5 9.2 1.5 12z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}
