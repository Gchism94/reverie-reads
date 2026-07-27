---
description: Push the branch and open a PR using this repo's conventions
---

Push the current branch and open a PR.

## Safety — this is where the repo has been bitten

- Write the body to a **file** and use `--body-file`. Never inline a body in a double-quoted shell
  string.
- Any heredoc must be single-quoted (`<<'EOF'`), so backticks and `$(…)` stay text.
- A deploy command must never appear as an unquoted literal in a PR body or commit message.

## Body

Lead with what a reviewer needs before they read the diff:

- If a finding contradicts how the work was framed, put it **first**, under its own heading.
- Root cause and evidence, not just what changed.
- What you verified, and what you did **not** check.
- Anything found and deliberately left alone, with the reason.
- Merge notes: conflicts with open branches, ordering, migrations that need deploying.
- Correct any earlier claim of yours that turned out wrong — the durable record matters more than
  looking consistent.

Then report the URL and mergeable state. **Do not merge.**
