# Skin Design Brief 01 — Marrow

_The specimen archive. Horror. Bone, ash, and a creeping fog._

Marrow is first because it is the standard-bearer, and because writing it forces the method the other eight inherit. This brief is words, not pixels: it names what Marrow already is, what it fails to be past the chrome, and what should change. It is not an implementation plan and does not authorize code.

## The method, established here

The audit found the thing that reorders this whole project: **the nav's character is material, not shape.** `AppShell.tsx` has zero skin conditionals. Its items are `rounded-[10px]` with a Tailwind-default 150ms color transition (AppShell.tsx:46) — generic geometry that ignores Marrow's own `--radius-control: 0px` and its 240ms creeping ease. And yet the nav is unmistakably Marrow, because the carved lintel is doing the work: a 6px slate slab, chamfered at its top corners, splaying wider as it descends (skin-kit.css:496–510).

That is the finding these briefs are built on. Shape is cheap and material is expensive, so effort goes to material. A brief that spends itself specifying radii is a brief that will produce a skin that looks like the others with different corners.

Marrow proves the point twice over, because it is _also_ full of shape contradictions that don't hurt it. Its own CSS says everything cut, never round — and it ships 10px nav items, a `rounded-2xl` More sheet (AppShell.tsx:312), 24px mobile dialogs, and a circular gold-gradient FAB (AppShell.tsx:370). The skin survives all four. It would not survive losing the lintel.

## What Marrow already is

The token block (tokens.css:206) is one of the most complete in the app and needs no additions to do most of what follows. Shape reads zero radius on controls and panels, 2px on cards, with the cut carried by `--ctl-clip` — an eight-point polygon taking 6px off each corner at 45°, the "cut bone" comment. Type is Libre Franklin as the specimen-label grotesque, uppercase at `0.14em` tracking, with Playfair Display setting numerals in lining figures. Motion is `cubic-bezier(0.5, 0, 0.75, 0)` over 240ms — slow to start, late rush, annotated _creeping_, and genuinely unlike any other skin's easing.

The palettes carry a material inversion worth naming, because it's the most sophisticated idea in the skin and nothing outside the buttons uses it. At night the primary CTA is a bone plaque — `#f2ead9` to `#d8cfba`, warm, lit from above. In daylight it becomes granite: `#3a3d44` to `#26282e` with bone ink (tokens.css:817). The plaque doesn't lighten with the room; it changes substance. The comment says so plainly — _the daylight plaque is granite_.

Three objects already ship at full strength. The lintel. The fractured divider, whose two halves are drawn out of registration by design — `M12 12h94` against `M208 14h-90`, the right side sitting 2px low, with a 4×3px tick at the break. And the three button materials: the chamfered bone plaque, the secondary carved into granite with an inset shadow and no border, and the icon action as a specimen pin — a radial-gradient sphere in slate.

`SKIN_STRUCTURE` (skinStructure.ts:202) registers a full anatomy that mostly never reaches a reader: `sectionRule: 'fractured'`, `frame: 'chamfer-tray'`, `tag: 'chamfer-chip'`, `progress: 'vertebrae'`, `motif: 'crack'`, an ash-cloth spine with a bone rule at the head, an oxblood dip as colophon, a pasted № label, and a box-lid placeholder. The vocabulary is written. The deployment is three call sites.

## Where Marrow fractures

Past the chrome, Marrow is a generic app in an oxblood palette.

The seam is precise. Cards carry `.skin-card`, so they inherit the 2px radius — but no `[data-skin='marrow']` rule touches that hook, so a card is a 2px box with a hairline, exactly as it is in Firstlight and Hearth. Nineteen of twenty dialogs funnel through one `.rv-modal` panel, also untargeted; the twentieth (LibraryRoute:91's desktop detail drawer) is bare utilities and can't be reached at all. The specimen archive has no drawers, no trays, no specimen cards — it has boxes.

The fracture idea is the sharpest concept in the skin and appears exactly once, in a divider. `sectionRule: 'fractured'` is registered and every section header in the app draws a plain rule instead. A reader scrolling Library sees the carved lintel at the top and then nothing beneath it that knows what building it's in.

The creeping ease has the same problem in reverse: it is tokenized, correct, and distinctive, and the surfaces a reader touches most run Tailwind's 150ms default. Marrow's motion signature exists in CSS and not in the hands.

`--ambient-texture` is authored here at full specification — fractal noise at 0.6 base frequency, 220px tile, soft-light, 0.06 opacity over the heavy vignette — and mounts nowhere outside `/lab`. Marrow's ash grain has never been seen by a reader.

## What should change

**Give the modal a body.** `.rv-modal` is one untargeted hook serving nineteen call sites, which makes it the highest-leverage surface in the app and the natural home for `chamfer-tray`. A Marrow dialog should be a specimen drawer: zero radius, the `--ctl-clip` cut applied at panel scale, the oxblood `--ornament-frame` inset hairline that `.skin-plate` already knows how to draw, and the granite/bone material logic the CTA uses per mode. This single rule converts most of the app's dialog surface at once.

**Give the card an edge.** Twenty-seven sites, one hook, zero rules. Marrow's cards should read as specimen cards — the chamfer at card scale, the existing oxblood `--line` at 20% carrying the hairline, and the inset frame. The radius is already right; nothing about shape needs specifying.

**Deploy the fracture.** `sectionRule: 'fractured'` should reach the section headers on the slice screen. The divider proves the idea works at 220px wide; the question this brief cannot answer, and the slice must, is whether out-of-registration halves read as _intent_ at full section width or as a rendering bug. That is a words-to-pixels risk and I want it tested early rather than specified confidently.

**Let the body creep.** Surfaces adopting `.skin-control` inherit `--motion-ease` and `--motion-duration` for free. Wherever the slice touches a transition, it should come from the tokens.

**Mount the texture.** Not a Marrow decision — it's authored for all nine and unmounted for all nine, so it belongs to the vertical slice as a shared question. Marrow is the best skin to test it in, because 0.06 grain over a near-black vignette is where it either reads as material or reads as noise.

**Bring MoodChip onto the kit.** Its className is `rounded-full border … italic` with no kit class at all, which puts a first-class reader-assigned dimension entirely outside the cascade. In Marrow specifically, a pill-shaped italic chip is the single most off-message object on the screen. It should at minimum take `.skin-control`, which gives it zero radius, the chamfer, Franklin caps, and the creeping ease in one change.

## What must not be touched

The lintel, the fractured divider, the three button materials, the ash-cloth spine with its bone rule and oxblood dip, and the box-lid placeholder. These are the skin. Everything above is an argument for extending them downward, never for revising them.

## Two things I noticed that aren't in the audit

`SkinDivider` hardcodes `color: 'var(--gold)'` for all nine motifs — and in Marrow, `--gold` is `#8c9a3c`, an olive. Marrow's fractured rule therefore draws in moss, not bone and not oxblood. It may well be deliberate: a specimen archive with something growing in it is a good idea. But it is not stated anywhere in the skin's comments, and it means the one place the fracture appears is rendered in a hue the rest of the skin never uses. Worth a deliberate yes or no before the slice.

Marrow's `.rv-chrome` sets `padding-bottom: 13px` where all eight other skins set 12px (skin-kit.css:497). The lintel is 6px against everyone else's 4–5px, so the extra pixel is probably intentional optical compensation — but it's undocumented, and an undocumented odd value is the kind of thing a future cleanup pass rounds off. If it's intentional, it deserves a comment saying so.

## Slice recommendation

Marrow is the right skin for the vertical slice, and the screen should be whichever one is densest in cards and contains a modal. The reachability picture makes the work almost entirely CSS against two existing hooks, which means the slice tests the _design thesis_ — does material carried into the body close the seam — rather than testing a migration. That is the question worth answering first, and it's the one the other eight briefs are waiting on.
