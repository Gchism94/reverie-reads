---
description: Implement a docs/task-*.md file end to end, with verification and a completion report
argument-hint: <path to task doc, or a description>
---

Implement: $ARGUMENTS

Read `CLAUDE.md` first, then the task file. Task docs follow one skeleton — Context, Fixes/Scope,
Out of scope, Acceptance / eyeball checklist, Completion report. Honour "Out of scope" literally.

## Preconditions — stop and report

If a prerequisite is unmet (a branch that must merge first, a doc that doesn't exist, a migration
not applied, credentials you don't have), **stop and say so**. Do not start adjacent work to look
busy, and do not guess at the blocked part. Report what is blocked, what you verified is blocked,
and what you can do meanwhile.

## Investigate before fixing

Reproduce the problem before changing anything. State the root cause and the evidence for it. If
the task doc's stated cause turns out to be wrong, say so plainly and fix the real one.

Distinguish these, and name which applies:
- a real defect in shipped code
- a stale test assertion that no longer matches a deliberate decision
- a fix that landed somewhere the reader never reaches

## Build

- Branch per the task; never commit to `main`.
- Port, don't rewrite, logic that already exists and is tested.
- Colours come from design tokens — never hardcoded — and must hold across every skin × mode.
- A11y is part of done: visible keyboard focus, contrast, `prefers-reduced-motion`.
- Never compute or display an averaged rating.
- Pure, testable logic belongs in `packages/core` with unit tests.

## Verify in the real app

DB-level verification is not verification. Drive the actual controls a reader touches, in the
browser. e2e guards must exercise the real gesture — a real drag, a real click — not assert an
attribute and call it covered.

Then run `/gate`.

## Report

End with a completion report: what changed and why, what you verified and how, what you did **not**
check, and anything you found but deliberately left alone.

Do not merge, push, or deploy without an explicit instruction naming that action.
