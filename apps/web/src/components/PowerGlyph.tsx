/**
 * The sign-out mark — a power symbol, drawn rather than typed.
 *
 * Replaces the power symbol (U+23FB), which rendered as tofu on Android Chrome. It sits in the
 * Miscellaneous Technical "power symbols" sub-range (U+23FB–U+23FE, added Unicode 6.0), a block
 * with historically patchy Android coverage — Roboto doesn't carry it, and neither does the
 * regular text path through Noto Color Emoji, so it falls to whatever symbol-fallback font (or
 * none) the OEM shipped. None of the app's nine custom skin fonts cover it either — verified via
 * Google Fonts' own `unicode-range` descriptors for Hanken Grotesk (tryst's sans, the widest of
 * the nine): its broadest Latin subset stops at U+206F plus a handful of isolated math arrows, so
 * every skin was already falling through to the OS for this glyph, tofu or not. That also means
 * per-skin coverage isn't the axis that matters here — the OS is. See docs/BACKLOG.md for the
 * fuller glyph-coverage inventory this bug motivated.
 *
 * No character in the app's proven-safe set (⇄ ⊹ ⊘ — Arrows/Math Operators, U+21xx/22xx, the
 * blocks Hanken Grotesk's own subset touches and which render reliably cross-platform) carries a
 * power/exit meaning, so this is the SVG case the audit's fix guidance names rather than a
 * character substitution.
 */
export function PowerGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
      style={{ display: 'inline-block', verticalAlign: '-0.15em' }}
    >
      <path d="M8 2v6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M4.5 4.2a5.5 5.5 0 1 0 7 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
