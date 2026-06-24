# Step 8 — final acceptance checklist

Run before declaring Step 8 (and the build) done. For each item: verify, then report
**pass/fail with evidence** (test name, screenshot, or a short note). Fix failures before
sign-off. Don't mark the step complete with any ✗ outstanding.

## A. Step 8 scope
- [ ] **Offline mirror (Dexie):** app loads and lets you browse/search/edit the library
      with the network off; changes queue locally.
- [ ] **Background sync + conflict policy:** offline edits reconcile on reconnect without
      clobbering newer server state. Conflict rule is written down and tested (e.g.
      field-level last-write-wins on `updated_at`; reread/review/list rows merge, not
      replace). Include a test: edit the same book on two clients, one offline, reconnect.
- [ ] **Enrichment Edge Function:** cover/metadata lookup runs server-side
      (Google Books → Open Library → Hardcover per `docs/DATA_SOURCES.md`), cached,
      rate-limit-aware.
- [ ] **CSV import Edge Function:** Goodreads/StoryGraph import runs server-side; merges
      by title+author; brings ratings, shelves, and real read dates.
- [ ] **Accessibility pass:** visible keyboard focus everywhere; contrast meets AA in
      **both** Nocturne and Magnolia Dawn; switches/chips have real semantics.
- [ ] **Reduced motion:** with `prefers-reduced-motion`, the night-sky drift/twinkle/fog
      is disabled; nothing essential depends on motion.
- [ ] **Performance / code-splitting:** the deferred route-level code-splitting is done;
      report initial bundle size and a Lighthouse (or equivalent) score.
- [ ] **Backup / export round-trips ALL fields** — especially the newer ones:
      `owned{physical,ebook,audiobook}`, `myRating`, `reviews`, `reads`, `plan`,
      list/club membership. Export → wipe → import reproduces the library exactly.

## B. Re-verify the late-added ⭐ requirements (most likely to be missing)
These were specced after the original Step 5/6 checks — confirm they actually landed.
- [ ] **S1 Per-format ownership:** book detail has independent Physical / Ebook /
      Audiobook toggles; ≥1 on = owned, all off = not owned/wishlist; live caption.
      (Confirm Physical paperback/hardcover sub-choice per the owner decision.)
- [ ] **S2 Separate owned shelves per format:** distinct auto/smart shelves
      **Owned · Physical**, **Owned · Ebook**, **Owned · Audiobook**, derived from the
      toggles (not hand-edited), with live counts; owned-format icons on cover cards.
- [ ] **R1 No aggregate rating:** no averaged/Goodreads-style star number anywhere
      (cards, detail, lists, shelves). The reader's own rating still shows.
- [ ] **R2 Opt-in individual reviews:** book detail can show **individual** reviews from
      others on demand, listed (never averaged into a headline number).
- [ ] **11 Mass import + mass merge:** bulk add (CSV + bulk ISBN/title) AND a
      "review-and-merge all detected duplicates" bulk action — not one pair at a time;
      ideally an auto-dedupe pass offered on import.

## C. Realtime + spoiler-gating edge
- [ ] **Gated rows never leak:** a behind-progress reader's Realtime stream and any
      refetch never deliver `club_comments` rows past their progress (RLS verified).
- [ ] **Locked count still updates live:** when someone posts a comment *ahead* of a
      reader, that reader's "🔒 N hidden — unlocks at …" indicator updates without a
      manual refresh — via a content-free signal/refetch (e.g. a count RPC or a
      members/activity event), NOT by sending the gated rows. Add a test for this.
- [ ] **Progress advance reveals correctly:** raising your progress unlocks exactly the
      now-eligible comments, live.

## D. Full regression against the master list
- [ ] Walk `docs/REQUIREMENTS.md` top to bottom; confirm each ✅/◑/⭐ item works in the
      built app in both themes, mobile + desktop. Report any gaps.
- [ ] `pnpm lint`, `typecheck`, `test`, `e2e`, `build` all green; note test count.

## Final gate
Step 8 is done only when A–D are all ✓ (or any deferral is explicitly listed and
approved by the owner), the app works offline and reconciles on reconnect, and the
master requirements pass in both themes.
