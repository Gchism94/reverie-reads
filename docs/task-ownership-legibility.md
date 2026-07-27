# Task: Ownership Legibility — Readable Labels, Honest Shelf Names

> **Status: shipped in #71.** This is the brief the work was built against, not a description of
> how the app behaves today. For current behavior, read the code and `docs/DATA_MODEL.md`.

**Branch:** `fix/ownership-legibility`
**Repo:** book-corpus
**Dependencies:** `feat/ownership-v2` merged (it is). No migration — copy/label and shelf-
scoping labels only.

## Context

Ownership-v2 shipped four states with per-skin vocabulary, but two problems surfaced on
the real app:

1. **The skin vocabulary is too obscure to operate.** On Marrow, the ownership control
   reads "The house has it / A guest of the house / The house wants it / The house hasn't
   decided." Lovely as flavor, but as *buttons the user taps* they fail the basic test:
   you can't tell what tapping one does without reading the subtext. Evocative is fine
   for labels you *read* (like the taste tiers); it's wrong for controls you *operate*.

2. **A borrowed book appears under a shelf labeled "Owned."** Setting a book to borrowed
   (with a format) correctly lands it on the Physical format shelf — but that shelf's
   header still says "Owned — the copies you own," which now contradicts its contents.

## Decisions (locked)

- **Vocabulary:** plain, legible button word is primary; skin voice becomes a subtitle/
  secondary line, not the button label itself.
- **Shelves:** borrowed books *belong* on the format shelves (a borrowed paperback is a
  physical copy in hand). The fix is to **relabel** the shelf, not remove borrowed books
  from it.

## 1. Legible ownership control

- The four ownership buttons show a **plain primary word**: `Owned` / `Borrowed` /
  `Wishlist` / `Not set` (adjust "Wishlist" to whatever the app's established term is, but
  keep it plainly legible).
- The **skin's character voice becomes a subtitle** beneath or beside the plain word —
  e.g. Marrow: **Borrowed** with "a guest of the house" as the small secondary line;
  Aphelion: **Borrowed** / "on loan". The nine-skin vocabulary from ownership-v2 is
  preserved, just demoted from label to flavor text.
- Test the plain label alone answers "what does this button set." The subtitle adds
  character; it must never be the only thing telling the user what the control does.
- Keep the existing selected-state styling and the registry-keyed contrast test green.

## 2. Honest shelf labels

- Rename the "Owned" format-shelf section so its label matches its contents now that it
  includes borrowed books. Options: "In hand", "Your copies", "On your shelves" — pick
  one that fits the skin system and the physical-library feel, and note the choice.
- Update the section's helper copy ("Updates as you mark the copies you own") to reflect
  that it's owned-or-borrowed (copies you have, however you got them).
- Verify a borrowed book with a format shows under the relabeled section and reads
  correctly — not as a contradiction.

## 3. Sweep for the same contradiction elsewhere

- Grep for any other copy that says "own"/"owned" on a surface that now includes borrowed
  books (stats labels, filter chip names, empty-state text). Report and fix any that now
  misdescribe their contents. Do NOT change the underlying scoping (isPossessed is
  correct) — only the labels that describe it.

## Out of scope

Ownership state logic, the four-state model, migrations. This is labels and copy only.

## Acceptance / eyeball checklist

- [ ] Ownership control readable at a glance in ≥3 skins including Marrow — the plain
      word tells you what it sets; the skin voice is subtitle
- [ ] A borrowed book appears under an honestly-labeled format section, no "Owned"
      contradiction
- [ ] No remaining "own/owned" copy misdescribes a surface that includes borrowed
- [ ] Contrast test, axe, full suite, `pnpm build` green

## Completion report

Report: the plain-label + subtitle treatment, the shelf section's new name and helper
copy, the grep results for other "owned" mislabels, and skins eyeballed.
