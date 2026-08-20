#!/usr/bin/env bash
#
# check-pr-landed.sh — did this ref's work actually reach the base branch?
#
# THE PROBLEM THIS EXISTS FOR
# A stacked PR is branched from another PR's own unmerged head. That is a reasonable thing to do
# when `main` has not caught up yet — but it creates a way for work to merge and still be lost:
#
#   PR #251 branched from main.
#   PR #252 branched from #251's head (correct — #251 had not landed yet).
#   #251 merged to main.
#   #252 then merged into #251's BRANCH, not retargeted to main.
#
# #252 shows "Merged" in the UI. Its commit is reachable from a branch that already merged once, and
# from nowhere on main. Nothing errors, nothing is red, and the work is simply gone from the product
# until someone notices. It was noticed by hand, running `git merge-base --is-ancestor` on a hunch.
# That is what this script turns into a habit.
#
# WHAT IT DOES NOT DO
# It does not read GitHub. "Merged" is exactly the claim that misled here, so the question it asks is
# the one that cannot be fooled: is this commit an ancestor of the base branch's tip?
#
# PASS THE BRANCH REF, NOT THE PR's HEAD SHA — the tool's own blind spot, and it is a real one.
# Ask this about a PR's `headRefOid` and the answer is "landed" every time the PR merged, because
# that SHA is BY DEFINITION what merged. It is a tautology, not a check. Anything pushed to the
# branch AFTER the merge is a different commit, is reachable from the live branch ref and from
# nowhere on main, and is invisible to a headRefOid query — so the one query that always returns
# green is the one that cannot see this whole class.
#
# That class is not hypothetical and it is not the same as the stacked-PR case above: `.husky/pre-push`
# (#303) refuses a push to a branch whose PR has already merged, but it only fires on a push, so it
# says nothing about a branch that was pushed and then never got a PR at all — the neighbour failure
# found on 2026-08-20, where `feat/search-withheld-notice` sat on the remote, unmerged, in nobody's
# queue, duplicating work that shipped as #306.
#
# So: `scripts/check-pr-landed.sh feat/some-branch` — the LIVE REF, which moves as the branch does.
# For a sweep over everything still on the remote, `git cherry main origin/<branch>` compares by
# PATCH-ID rather than SHA, which also survives the cherry-pick/rebase that makes SHA comparison lie.
#
# USAGE
#   scripts/check-pr-landed.sh <branch-or-commit> [base-branch]     # base-branch defaults to main
#
#   scripts/check-pr-landed.sh fix/some-feature
#   scripts/check-pr-landed.sh fc834c4 main

set -euo pipefail

bold=$'\033[1m'; red=$'\033[31m'; green=$'\033[32m'; dim=$'\033[2m'; reset=$'\033[0m'
die() { printf '%s\n' "${red}${bold}check-pr-landed:${reset} $*" >&2; exit 2; }

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || die "usage: scripts/check-pr-landed.sh <branch-or-commit> [base-branch]"
ref="$1"
base="${2:-main}"

command -v git >/dev/null 2>&1 || die "git not found"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a git repository"

# Fetch first: the whole point is a comparison against what the REMOTE base actually contains, and a
# stale local ref would answer a question about yesterday's main.
git fetch --quiet origin || die "could not fetch origin"

git rev-parse --verify --quiet "origin/${base}" >/dev/null \
  || die "no such base branch: origin/${base}"

# Resolve the ref AFTER the fetch, so a branch name that only exists on the remote still works.
if ! sha="$(git rev-parse --verify --quiet "${ref}^{commit}")"; then
  sha="$(git rev-parse --verify --quiet "origin/${ref}^{commit}")" \
    || die "could not resolve '${ref}' as a commit or branch (tried '${ref}' and 'origin/${ref}')"
fi
short="$(git rev-parse --short "$sha")"

if git merge-base --is-ancestor "$sha" "origin/${base}"; then
  printf '%s\n' "${green}✓${reset} ${bold}${ref}${reset} (${short}) is reachable from ${bold}origin/${base}${reset} — landed."
  exit 0
fi

printf '%s\n' "${red}✗${reset} ${bold}${ref}${reset} (${short}) is NOT reachable from ${bold}origin/${base}${reset}."
printf '%s\n' ""
printf '%s\n' "If this was expected to have landed (e.g. as part of a stacked PR merge), its commits may"
printf '%s\n' "be stranded on a branch that already merged once elsewhere — a PR can read \"Merged\" in the"
printf '%s\n' "UI while its base branch had already merged to ${base} separately, leaving nothing on ${base}"
printf '%s\n' "able to reach it."
printf '%s\n' ""
printf '%s\n' "Find where ${short} actually lives:"
printf '%s\n' "  ${dim}git log --oneline --all --source | grep ${short}${reset}"
printf '%s\n' ""
printf '%s\n' "If it is stranded, cherry-pick it onto a fresh branch off origin/${base} and open a new PR;"
printf '%s\n' "do not re-merge the old branch."
exit 1
