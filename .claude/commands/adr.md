---
description: Record an architecture/design decision in docs/decisions/
argument-hint: <the decision>
---

Record: $ARGUMENTS

Write `docs/decisions/NNNN-kebab-title.md`, numbering from the existing files. Match their shape:

    # ADR NNNN — <title>

    **Status:** accepted · <date>
    **Context:** <branch / task doc>

    ## Decision
    ## Where the extension attaches later
    ## Consequences

## What earns its place

- The decision, in the affirmative — what we do, not what we considered.
- **The evidence**, especially where it contradicts how the work was framed while being built.
  An ADR that quietly drops a wrong earlier assumption is worth less than one that names it.
- What was deliberately **not** built, and what would attach it later.
- What was **not** checked, so the next person doesn't rediscover it.

Deferred is not rejected — say which.
