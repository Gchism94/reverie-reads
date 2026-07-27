# Task: License & Repository Usage Materials

> **Status: shipped in #61.** This is the brief the work was built against, not a description of
> how the app behaves today. `NOTICES.md` is regenerated from `pnpm licenses list --prod
> --json`, not edited by hand. For current behavior, read the code and `docs/DATA_MODEL.md`.

**Branch:** `chore/license-and-docs` off updated main
**Repo:** book-corpus
**Dependencies:** none. No migration, no functions, no application code. Text files only.
**Note:** `pnpm build` must stay green; nothing here should touch source.

## Decision (locked, but trivially reversible)

The repository is licensed **proprietary / all rights reserved**, with an explicit
learning-use grant for the training fork. Rationale: proprietary → open is a one-file
change later; open → proprietary is impossible for already-released commits. Do not
substitute an OSI license.

## 1. `LICENSE`

Create a plain-text proprietary license at repo root:

- Copyright line: `Copyright (c) 2026 Greg Chism. All rights reserved.`
- State plainly: no permission is granted to use, copy, modify, merge, publish,
  distribute, sublicense, or sell copies of this software, except as expressly stated
  below.
- **Training-fork grant:** a limited, revocable, non-transferable grant permitting
  designated collaborators to fork, clone, run locally, and modify the code **for
  personal learning and for contributions submitted back to this repository**. No
  redistribution, no production deployment, no commercial use.
- **No warranty** clause (standard "AS IS", no liability) — keep this even though the
  license is proprietary.
- A line noting that third-party components and content are governed by their own terms,
  pointing to `NOTICES.md`.

Keep it short and readable. Do not paste an OSI license text.

## 2. `NOTICES.md`

The protective piece — be precise here:

- **Third-party content is not covered by this license and is not the repository
  owner's to license.** Specifically call out: book cover images (retrieved from Google
  Books, Open Library, Hardcover, or uploaded by users — each remains the property of
  its rights holder, typically the publisher); bibliographic and metadata records from
  the Hardcover and Google Books APIs, used under their respective API terms; any user
  -supplied content.
- **Dependency licenses:** generate an actual inventory rather than hand-waving. Run a
  license scan of the production dependency tree (e.g. `pnpm licenses list --prod` or
  equivalent) and include a summarized table of license types with counts, plus the full
  list in an appendix or a generated file. Note the command used so it can be
  regenerated.
- Call out **Understand Anything** (MIT) explicitly if it is vendored or referenced in
  the training fork tooling.
- Note that API usage is subject to Hardcover's and Google Books' terms of service, and
  that API keys are not distributed with this code.

## 3. `README.md` (public-facing rewrite)

The current README is build-phase oriented and points at `AGENTS.md`. Rewrite for a
human arriving at the repo cold, preserving any build-phase pointers under a clearly
marked section:

- What Reverie is, in two or three sentences — a personal book library with a
  skinnable, genre-neutral interface, built around the idea that a reader's own taste
  should drive discovery rather than aggregated ratings.
- The stack, briefly (React/TS, pnpm monorepo, Supabase, Vercel, pgvector).
- Local setup: prerequisites, `pnpm install`, `supabase start`, required env vars **by
  name only** (never values), how to run dev/test/e2e.
- **Deploy discipline:** point to `docs/DEPLOY.md` and state that prod deploys go
  through `pnpm deploy:migrations` / `pnpm deploy:functions` from main after merge.
- A prominent **License** section: proprietary, all rights reserved, see `LICENSE`; and
  a one-line pointer that cover images and book metadata are third-party — see
  `NOTICES.md`.
- Do **not** include screenshots that contain real user data.

## 4. `CONTRIBUTING.md` (repo root)

Codify the house rules that have been enforced conversationally. If a
`CONTRIBUTING.md` already exists for the training fork, reconcile rather than duplicate:

- **The golden rule:** nothing merges until it has been eyeballed on the real
  authenticated app — never on `/lab` specimen screens.
- Branch naming, one concern per PR, and the explicit-merge-authorization pattern
  (PRs are merged on the owner's explicit word, never on implied context).
- The gate a PR must pass: `pnpm build` green (including tsc), full test suite, lint,
  e2e including the all-skins axe sweep.
- **Deploy discipline:** migrations and function deploys run from `main` after merge,
  via the guard scripts, never from a feature branch mid-flight.
- **Shell safety:** heredocs containing shell examples must be single-quoted
  (`<<'EOF'`); deploy commands must never appear as unquoted literals in PR bodies,
  commit messages, or reports.
- Accessibility and skin-token requirements as part of "done" (no hardcoded colors;
  registry-keyed contrast test must pass across all nine skins).
- A note that the license is proprietary and contributions are accepted under the
  training-fork grant.

## 5. `SECURITY.md`

Short and honest:

- How to report a vulnerability (a contact address — use a placeholder
  `SECURITY_CONTACT` that Greg fills in; do not invent an email).
- Ask reporters not to open public issues for security matters.
- A brief statement of the privacy posture: reading statistics, Wrapped, goals, and all
  analytics are owner-only and enforced at the database level via row-level security;
  shelves are private by default. Be precise — do not over-promise "never public" for
  anything that has a user-controlled sharing path.
- Note that API keys and service-role credentials are never committed and live only in
  deployment environment secrets.

## 6. `CODE_OF_CONDUCT.md`

Only if the repository is public. Use the Contributor Covenant v2.1 verbatim with the
contact line pointing at the same `SECURITY_CONTACT` placeholder. If the repo is
private, skip this file and say so in the report.

## Out of scope

Any change to application code, dependencies, migrations, or functions. Do not add
license headers to source files. Do not change the repository's public/private status.

## Verification

- `pnpm build` green, tests green, lint clean (nothing here should affect them).
- Every file renders correctly on GitHub (check markdown tables and code fences).
- No secrets, no real email addresses invented, no user data in any example.
- The dependency license inventory is generated by a real command, not written from
  memory — include the command and its output.

## Completion report

Report: each file created and its length; the dependency license summary (types and
counts, and anything unexpected — e.g. a GPL/AGPL dependency in a proprietary project,
which must be flagged loudly); whether the repo is public or private and therefore
whether the code of conduct was included; and the exact placeholders Greg must fill in
(`SECURITY_CONTACT`, and confirm the copyright name/year).
