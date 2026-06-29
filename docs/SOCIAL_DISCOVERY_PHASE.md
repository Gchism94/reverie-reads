# Social / Discovery layer (post-launch phase) — feature capture 2026-06-28

THROUGH-LINE: a social/discovery layer that deliberately strips out popularity + consensus mechanics
(no aggregate ratings, no follower counts). Discovery runs on TASTE (similarity) and CONTENT STRUCTURE
(taxonomy), never "what's popular." On-brand: calm, anti-engagement, taste-first. This principle governs
all detailed decisions.

## 1. Personal ratings (no conglomerate)
Personal stars (5 w/ half-steps), optional per book. NEVER pooled/averaged anywhere in the product. If a
library is public, others see THAT person's star on a book -- never a global average. Ratings feed the
similarity metric (#4) as the strongest taste signal.

## 2. Public model -- KEYSTONE (everything below depends on it)
DECISION (recommended): private-by-DEFAULT, OPT-IN to public, ALL-OR-NOTHING per library (no per-field
toggles). Preserves "private until you choose" while enabling the social layer.
- BRAND: soften "private -- always" -> "private by default, public when you choose" (landing/auth copy
  rework, not a contradiction).
- CARVE-OUT (open decision): does "everything" include personal COVER PHOTOS (your own-copy shots) +
  private NOTES? Recommend NOT -- public = books/shelves/ratings/taxonomy; cover photos + notes stay
  private (consistent with the Cover Studio's "yours alone").
- ARCH: a public-read path alongside owner-scoped RLS (public profiles, shared flag, public policies,
  discoverable index). The big lift; built first.
- SAFETY: publicly browsable + followable corpus changes the safety surface; the lean report/hide model
  was sized for reviews, not public discovery/follow. Needs a deliberate safety/privacy pass (what public
  exposes, user discoverability, harassment vectors, minors) -- content skews adult (dark romance).

## 3. Follow + hidden counts
Follow readers/libraries; NO follower counts. Strongest form (recommended): also hide the follower LIST
entirely -- you see who YOU follow (your discovery tool), but there's no audience to accrue/perform for.
Asymmetric, no approval (target is public). DECISION: confirm full-hide (no follower list at all).

## 4. Similarity / dissimilarity ranking
The discovery engine that replaces "popular." Both directions: SIMILAR libraries (taste-matched recs) +
DISSIMILAR (deliberate bubble-breaking). Pure-core computable (like the matcher): ratings-weighted blend
of shared titles + genre/trope distribution, over the PUBLIC pool only. Surfaced as "readers like you /
unlike you." Caveat: cold-start -- thin until enough libraries are public.

## 5. Taxonomy decision-tree browse
Reuses the genre->subgenre->trope taxonomy the import/enrichment already built. Drill-down over
partitioned shelves, two scopes: (a) your FOLLOW-graph, (b) OVERALL de-duped public corpus (each book
once, not once per owner). STRUCTURE: tropes don't nest cleanly (e.g. enemies-to-lovers spans romance +
fantasy) -> genre->subgenre TREE with tropes as FACETS layered on, not a strict single tree.

## SEQUENCING
Post-launch phase, built on the public/social infrastructure. #2 (public model) is the keystone -- decide
+ build first; #3/#4/#5 depend on it. Gate a safety/privacy pass before going public. v1 launch remains
the PRIVATE personal library.

## OPEN DECISIONS FOR GREG
- #2 carve-out: cover photos + notes public, or kept private? (rec: private)
- #3: hide follower list entirely, or just the count? (rec: entirely)
- brand-copy rework to "private by default, public when you choose".

## HARD CARVE-OUT (2026-06-28): personal reading stats are NEVER public
Per docs/STATS_PRIVACY_AND_FEATURES.md: all reading stats/analytics (Stats/Wrapped, goals, challenges,
bingo, calendar, pace/streaks, rereads, ratings aggregates) are owner-only forever -- NO public-read
policy, no share/export. The public model's "literally everything" applies to the CATALOG (shelf + per-
book ratings), NOT to reading behavior/analytics. Wrapped is a PRIVATE year-in-review (the earlier
"shareable Wrapped" is retracted).
