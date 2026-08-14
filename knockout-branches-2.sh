#!/usr/bin/env bash
# Resume point — steps 0 (clean junk) and 1 (rename decision doc to 0006) already
# ran successfully. This picks up at push+PR. No bash arrays this time, so it
# behaves the same under bash or zsh. Run from ~/dev/book-corpus with either
# `bash knockout-branches-2.sh` or `zsh knockout-branches-2.sh`.
set -e

echo "== push + PR the 12 safe branches =="

git push -u origin audit/discover-recency
gh pr create --base main --head audit/discover-recency \
  --title "docs(audits): Discover recency — data problem confirmed, ranking exonerated" \
  --body "Part of the branch cleanup pass — see repo history for full context."

git push -u origin audit/series-position-integrity
gh pr create --base main --head audit/series-position-integrity \
  --title "docs(audit): series-position-integrity — Phase 1-4 audit, no fix" \
  --body "Part of the branch cleanup pass — see repo history for full context."

git push -u origin audit/spine-overlay-clamp
gh pr create --base main --head audit/spine-overlay-clamp \
  --title "docs(audits): spine overlay clamp — the clamp holds, the dead zone was underneath" \
  --body "Part of the branch cleanup pass — see repo history for full context."

git push -u origin audit/spine-reveal-band
gh pr create --base main --head audit/spine-reveal-band \
  --title "docs(audits): spine reveal band — vertical budget, ownership, survivals" \
  --body "Part of the branch cleanup pass — see repo history for full context."

git push -u origin audit/pre-public-secrets
gh pr create --base main --head audit/pre-public-secrets \
  --title "docs(audits): pre-public secrets sweep — full-history blob scan, no live secrets" \
  --body "Part of the branch cleanup pass — see repo history for full context."

git push -u origin docs/add-discover-redesign
gh pr create --base main --head docs/add-discover-redesign \
  --title "docs(design): Discover, rebuilt on library signal — draft" \
  --body "Part of the branch cleanup pass — see repo history for full context."

git push -u origin docs/add-metadata-sourcing-verification
gh pr create --base main --head docs/add-metadata-sourcing-verification \
  --title "docs(research): Phase 0 source-matrix verification addendum" \
  --body "Part of the branch cleanup pass — see repo history for full context."

git push -u origin docs/backlog-user-edited-resolved
gh pr create --base main --head docs/backlog-user-edited-resolved \
  --title "docs(backlog): remove the resolved user_edited-on-seed entry — both halves shipped" \
  --body "Part of the branch cleanup pass — see repo history for full context."

git push -u origin docs/ci-throughput-record
gh pr create --base main --head docs/ci-throughput-record \
  --title "docs: record ci/throughput — stages 1-2 landed, stage 3 cancelled" \
  --body "Part of the branch cleanup pass — see repo history for full context."

git push -u origin docs/decisions-and-briefs
gh pr create --base main --head docs/decisions-and-briefs \
  --title "docs(decisions): record the monetization boundary (0006) + skin brief 01" \
  --body "Part of the branch cleanup pass — see repo history for full context."

git push -u origin docs/discover-recuration-followup
gh pr create --base main --head docs/discover-recuration-followup \
  --title "docs(discover): task file for the next curated-Discover re-curation cycle" \
  --body "Part of the branch cleanup pass — see repo history for full context."

git push -u origin fix/duplicate-series
gh pr create --base main --head fix/duplicate-series \
  --title "docs(queries): duplicate-series audit — the Phase 1 read for fix/duplicate-series" \
  --body "Part of the branch cleanup pass — see repo history for full context."

git push -u origin fix/untitled-placeholder-titles
gh pr create --base main --head fix/untitled-placeholder-titles \
  --title "fix(series): never strip a placeholder title that cleans to bare Untitled" \
  --body "Part of the branch cleanup pass — see repo history for full context."

git push -u origin feat/discover-curated-candidates
gh pr create --base main --head feat/discover-curated-candidates \
  --title "feat(discover): curated candidate injection for the four starved categories" \
  --body "Part of the branch cleanup pass — see repo history for full context."

echo "== drop branches that don't need to land =="
# Duplicates — byte-identical content already covered by the branches pushed above.
git branch -D docs/recover-duplicate-series-query
git push origin --delete docs/recover-duplicate-series-query
git branch -D docs/recover-pre-public-secrets-audit
git push origin --delete docs/recover-pre-public-secrets-audit
# Superseded — the fix/series-entry-repair-counts.sql "blast radius" query came back all zeros
# against production. Phase 2 (set_series_order) + Phase 4 (ACOTAR position corrections) already
# covered everything this branch was staging a repair for.
git branch -D fix/series-entry-repair
git push origin --delete fix/series-entry-repair

echo "== drop the now-stale Iron Flame merge-prep stash (already run against production) =="
git stash drop

echo "== done — check gh pr list for anything that failed to open =="
gh pr list --state open