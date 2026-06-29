# A11y fix: cover-placeholder contrast across skins (2026-06-28)

CONTEXT: The a11y axe sweep (e2e/a11y.spec.ts) finally ran clean end-to-end (Option B + preflight working)
and returned its FIRST real verdict: 10 serious color-contrast violations -- ALL on the no-cover PLACEHOLDER,
ALL in grimoire/aphelion/marrow (Tryst passes clean). NO keyboard/aria/structural issues -> the desktop-align
shell, nav, and responsive rail are accessible. This is one contained component, not 10 bugs.

ROOT CAUSE (one bug, 10 instances): the no-cover placeholder paints its glyph/title in the skin ACCENT hue
against a same-hue surface, with no contrast floor -> lands wherever the two happen to fall. Two variants:
- DARK glyph-on-scrim (span[aria-hidden] inside .object-cover / [role=img]): grimoire 2.88, aphelion 2.47,
  marrow 2.16, marrow/Clubs 2.53. (aria-hidden, but axe flags it + it's visually low-contrast.)
- LIGHT title-on-gray-card (.font-bold.tracking-wide.uppercase on the .aspect-[2/3].rounded-xl card):
  grimoire 1.37-1.40, aphelion 1.24-1.25, marrow 1.01-1.02 (near-invisible -- the worst).
Surfaces: Library (cover grid), Clubs (h-14 w-10 spine thumbs), Book detail (large cover). Because
desktop-align consolidated everything onto the single CoverImage placeholder path, ONE fix covers every site.

FIX:
1. Placeholder text contrast-safe BY CONSTRUCTION. Don't use the raw accent/primary hue for the glyph/title.
   Use each skin's already-AA-validated on-surface INK/foreground token, OR enforce a luminance floor: nudge
   the text until >=4.5:1 against the placeholder surface (>=3:1 hard floor for the decorative glyph; aim 4.5:1
   for margin). Keep skin FLAVOR in the background/scrim, never by risking the text. Auto-fixes all 9 skins
   incl. the 5 unbuilt ones.
2. GUARDRAIL (high-leverage): add a PURE contrast unit test in @reverie/core over the full token matrix --
   every skin x mode, placeholder fg vs bg >= 4.5:1. Turns a 2.2-min e2e catch into an instant, exhaustive
   unit catch; lets you iterate the fix in ms; guards future skins so this never reaches the sweep again.

ATTRIBUTION (cheap, optional): almost certainly PRE-EXISTING on main (the placeholder predates desktop-align;
the branch only widened CoverImage usage). A 10-sec axe-on-main confirms, but fix regardless.

MERGE: fix-then-merge. Don't land known-red. After fix + core contrast test, re-run `pnpm e2e` -> expect green
-> merge desktop-align. The desktop shell itself already passed; this is the last thing between the branch and
main.
