# Task: De-Romance the Match Quiz

> **Status: shipped in #72.** This is the brief the work was built against, not a description of
> how the app behaves today. For current behavior, read the code and `docs/DATA_MODEL.md`.

**Branch:** `fix/match-deromance`
**Repo:** book-corpus
**Dependencies:** `feat/taxonomy-neutral` (#69) merged (it is — the broadened
subgenre/trope taxonomy and the removed vibe concept are the vocabulary this draws on).

## Context

The taxonomy work (#69) de-romanced subgenres and tropes, and Discover now spans all nine
genres correctly. But the **Match quiz was never touched** and is still a romance-era
artifact end to end:

- Its questions offer romance-shaped options ("Sweeping fantasy & magic / Dark & intense
  / Cozy & heartfelt / Fun, flirty & fast").
- Its answer→taste weights (the `arts`/quiz mapping in `quiz.ts`, historically tied to the
  now-deleted boyfriend derivation) map only onto romance.
- Its result vocabulary is romance-only: a horror-heavy library still yields "Sweet Dark
  Romance / Second Chance" with pills like "🌶 Sweet / dark romance / fast burn".

Result: Match returns romance no matter what the reader owns or asks for. This is a
hardcoded-quiz problem, **not** an embedding/centroid problem — fixing it is about the
quiz's questions, weights, and result vocabulary, not the vectors.

**Scope decision (locked): approach (a) — fix the romance-hardcoding in place, keep the
quiz.** A larger redesign that leans primarily on the reader's actual library/embedding
signal instead of a fixed questionnaire is the eventual goal for Match (approach (b),
logged below), but NOT this task. Here: make the existing quiz genre-neutral.

## 1. Neutral questions

- Rewrite the quiz questions and options so they span all nine primary genres (Romance,
  Fantasy, Science fiction, Horror, Mystery, Literary, Cozy, Nonfiction, Young adult),
  not just romance moods. The "what are you craving" question in particular must offer
  options a horror or literary or nonfiction reader sees themselves in.
- Keep the quiz's length and feel (5 questions, quick, skippable) — this is a rewrite of
  content, not a redesign of the flow.
- Preserve the free-text "describe tonight's vibe" input and the "skip — match my
  standing taste" path; those already work across genres.

## 2. Genre-neutral answer weights

- Rework the answer→taste mapping so answers map across the full genre/subgenre/trope
  space, not the romance-only `arts` vocabulary. Survey what the quiz currently produces
  and what the taste model consumes; the mapping should be able to steer toward horror,
  literary, nonfiction, etc. as readily as romance.
- If the old `arts` weight structure is romance-shaped at its core, replace it with
  something keyed off the current nine-genre taxonomy + broadened tropes rather than
  patching romance values.

## 3. Genre-neutral result vocabulary

- The result headline and descriptor pills must be able to express any genre. A
  horror-leaning result should read like horror ("Cosmic Dread", "Slow-Burn Horror"),
  a literary one like literary, etc. — never forced through romance framing.
- **The result pills currently show leftover vibe-style descriptors** (e.g. "🌶 Sweet /
  dark romance / fast burn"). These are romance-era artifacts related to the removed vibe
  concept. Replace them with descriptors drawn from the actual matched book's
  genre/subgenre/tropes, so the pills describe what was matched rather than a fixed
  romance vocabulary. Coordinate with the mood feature if it has landed (mood is
  reader-assigned and separate — do not derive mood here; these pills describe the
  match, not the reader's felt mood).

## 4. Verify against a mixed library

- The acceptance test that matters: run the quiz choosing non-romance answers (e.g.
  "dark & intense" intending horror) against the current mixed library (which now has
  King, Koontz, Rice, etc.) and confirm the result can surface horror, not romance.
- Confirm a romance answer still yields romance — de-romancing must not *break* romance,
  just stop it being the only outcome.

## Logged for the future (do NOT build): approach (b)

The ultimate goal for Match is to lean primarily on the reader's actual library and
embedding signal — their loved/rated books and taste centroid — rather than a fixed
questionnaire, so Match reflects what they own and love. Record this as a note/ADR
(`docs/decisions/`) so the direction isn't lost: the quiz is an interim mechanism;
Match's north star is library-signal-driven matching. Do not implement (b) here.

## Out of scope

The embedding sweep, the taste centroid math, the tier calibration — all separate and
working. The mood feature. Any (b)-style redesign.

## Acceptance / eyeball checklist

- [ ] Quiz questions/options span all nine genres; a non-romance reader sees themselves
- [ ] A non-romance answer against the mixed library produces a non-romance result
- [ ] A romance answer still produces romance (no regression)
- [ ] Result pills describe the matched book's actual genre/subgenre/tropes, not a fixed
      romance vocabulary; no leftover vibe-style descriptors
- [ ] The (b) ADR is committed
- [ ] Eyeballed on the real app; full suite, lint, `pnpm build` green

## Completion report

Report: the rewritten questions, how answer weights were made genre-neutral (patched vs.
replaced), the result-vocabulary change, the pill fix, the mixed-library verification
(what a horror-intent answer now returns), and the (b) ADR path.
