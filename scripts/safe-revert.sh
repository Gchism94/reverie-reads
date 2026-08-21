#!/usr/bin/env bash
#
# safe-revert.sh — revert one or more files to HEAD, but keep a copy of what you are about to
# destroy.
#
# THE PROBLEM THIS EXISTS FOR
# `git checkout -- <file>` resets the whole file to HEAD: the mutant you meant to undo AND any other
# uncommitted work in it, silently, with nothing recoverable. CLAUDE.md has carried "commit before
# mutation testing" since 2026-07-28 (#93), and it has still been violated three times:
#
#   · 2026-08-14 — `git checkout -- src/routes/IndieScreen.tsx` during Track B batch 4's mutation
#     run wiped six uncommitted .skin-control migrations. Found only when a later carrier count
#     came back 0.
#   · 2026-08-15 — the same thing on feat/card-surface-rulings-coverage (a2bdfd7), destroying the
#     uncommitted `card`/`line` fixture additions mid-mutation-run.
#   · A third time this session — which is why `git checkout --` is no longer just discouraged by a
#     note: `.claude/hooks/pretooluse-guard.sh` now blocks it outright for Claude Code sessions and
#     redirects here.
#
# Two written rules did not make it a reflex, because the moment of failure is a fast revert inside
# a loop, not a moment of deliberation. So this adds friction instead of a fourth note: back up
# unconditionally, then revert.
#
# WHAT IT DELIBERATELY DOES NOT DO
# It does not try to work out whether the current diff is "the deliberate mutant" or "real work".
# That judgment is exactly what failed both times — the mutant and the work look identical to the
# tool, and to the person, at speed. Everything is backed up; a human (or a later `diff` against the
# backup) decides afterwards what mattered.
#
# USAGE
#   scripts/safe-revert.sh <file> [<file2> ...]
#
# Each file is backed up and reverted independently, in order. If any file fails validation (not
# found, not tracked, ...) this stops before touching it or anything after it — nothing after the
# failing file is attempted. Whatever was already reverted stays reverted; the "backed up ... →
# ..." lines printed above the failure are the record of exactly what that was.
#
# Backups land in /tmp/mutation-revert-backups/<repo-path-with-slashes-as-dashes>.<unix-timestamp>,
# so repeated reverts of the same file never overwrite each other.

set -euo pipefail

BACKUP_DIR="${MUTATION_BACKUP_DIR:-/tmp/mutation-revert-backups}"

bold=$'\033[1m'; red=$'\033[31m'; dim=$'\033[2m'; green=$'\033[32m'; reset=$'\033[0m'
die() { printf '%s\n' "${red}${bold}safe-revert:${reset} $*" >&2; exit 1; }

[ "$#" -ge 1 ] || die "usage: scripts/safe-revert.sh <file> [<file2> ...]"

command -v git >/dev/null 2>&1 || die "git not found"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a git repository"

revert_one() {
  local target="$1"

  [ -e "$target" ] || die "no such file: ${target}"
  [ -f "$target" ] || die "not a regular file: ${target}"

  # Tracked-only, on purpose: `git checkout --` cannot restore an untracked file, so running this on
  # one would back it up and then fail, leaving the caller thinking a revert happened.
  git ls-files --error-unmatch -- "$target" >/dev/null 2>&1 \
    || die "not a tracked file: ${target} (git checkout cannot revert it)"

  # Repo-relative, so the backup name is stable regardless of where this was invoked from.
  local rel
  rel="$(git ls-files --full-name -- "$target" | head -1)"
  [ -n "$rel" ] || die "could not resolve a repo-relative path for ${target}"

  mkdir -p "$BACKUP_DIR"
  # Second resolution is NOT enough on its own. A mutation loop reverts the same file many times in
  # quick succession, and two reverts inside one second would collide — the second silently
  # overwriting the backup of the first, which is the exact class of quiet loss this script exists to
  # prevent. (`date +%N` is not portable to macOS's BSD date, so this disambiguates by suffix instead
  # of by finer resolution.) The first test written for this script only appeared to cover it because
  # it slept a second between reverts.
  local stamp backup
  stamp="$(date +%s)"
  backup="${BACKUP_DIR}/${rel//\//-}.${stamp}"
  if [ -e "$backup" ]; then
    local n=1
    while [ -e "${backup}-${n}" ]; do n=$((n + 1)); done
    backup="${backup}-${n}"
  fi

  # THE BACKUP HAPPENS FIRST, unconditionally — before any check of whether the file is even dirty.
  # A clean file costs one cheap copy; a dirty one is the whole point.
  cp -p -- "$target" "$backup"
  printf '%s\n' "${dim}safe-revert:${reset} backed up ${bold}${rel}${reset} → ${bold}${backup}${reset}"

  git checkout -- "$target"
  printf '%s\n' "${green}safe-revert:${reset} ${rel} reverted to HEAD. ${dim}Recover with: cp ${backup} ${rel}${reset}"
}

for f in "$@"; do
  revert_one "$f"
done
