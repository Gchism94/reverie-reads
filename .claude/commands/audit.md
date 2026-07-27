---
description: Investigate and report findings. Read-only — change nothing.
argument-hint: <what to investigate>
---

Investigate and report: $ARGUMENTS

**This is read-only.** No fixes, no refactors, no "while I was in there". If you find something
worth changing, write it in the report and stop.

Exception: throwaway diagnostic scaffolding (a probe spec, a scratch query) is fine — delete it
before you finish and confirm the tree is clean.

## Method

Reproduce before concluding. A plausible reading of the code is not a finding; an observed
behaviour is. Where the two disagree, trust the observation and say so.

Prefer the strongest evidence available:
- for behaviour: drive the real UI and read the database directly
- for "does this render": change the value to something unmistakable and look
- for "is this reachable": check the guard that gates it, not just the function it calls

## Report

- What you checked, and **what you did not** — an unaudited surface named is worth more than
  silence.
- Root cause with evidence, not a hypothesis stated as fact.
- Where a premise in the request turned out to be wrong, say which and why.
- Recommendations ranked, with the cheapest decisive next step first.
