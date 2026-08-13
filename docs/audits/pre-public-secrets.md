# Pre-public secrets audit

Audited 2026-08-03 on `audit/pre-public-secrets` (from `main` @ `45499d8`). Method: every unique
blob in the object store (`git cat-file --batch-all-objects` — 2,667 blobs across 331 commits on
all 49 refs, branches and remotes; the repo has no tags), scanned for JWTs, `sb_secret_*` /
`sb_publishable_*`, Google `AIza…` keys, connection strings with passwords, `PRIVATE KEY` blocks,
npm auth tokens, GitHub token shapes, and `*_SECRET/_TOKEN/_PASSWORD/_KEY` assignments; hits
mapped back to commits and paths with `git log --all --find-object`. Secret values are shown
first-4…last-4 only. Rotation and any history rewrite are the owner's to run — nothing here
changes anything.

## 1–2. Committed secrets, full history — every distinct value found

The 168 hit-bearing blobs reduce to **four distinct values**. No Google API key, no
`sb_secret_*`, no private key, no npm or GitHub token, and no non-local database password exists
anywhere in history.

| Value (redacted)                                                        | What it is                                                                                                    | Where / when                                                     | At HEAD?                 | Class                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eyJh…n_I0` (payload `iss: supabase-demo`, `role: anon`)                | The Supabase CLI's **well-known local demo anon JWT** — identical on every machine that runs `supabase start` | 149 blobs: e2e specs, `ci.yml` (inline at lines 32/98/176), docs | yes                      | **(b) local-stack demo value, safe to publish.** Signed with the CLI's public demo JWT secret (`super-secret-jwt-token-with-at-least-32-characters-long`); grants nothing anywhere but a local dev stack                    |
| `eyJh…81IU` (payload `iss: supabase-demo`, `role: service_role`)        | The CLI's **demo service-role JWT** — same provenance                                                         | 108 blobs: e2e specs, verification scripts                       | yes                      | **(b)** same reasoning. Worth one eyebrow when publishing — readers will "find" it and report it; it opens only their own local stack                                                                                       |
| `post…gres` (`postgresql://postgres:postgres@127.0.0.1:55322/postgres`) | Local-stack connection string, demo credentials                                                               | 2 blobs, `package.json` (first at `6cc5eca`, 2026-07-14)         | yes                      | **(b)** localhost + the CLI's fixed demo password                                                                                                                                                                           |
| `sb_p…KZgQ`                                                             | The **production publishable (anon) key**, with the production project ref in the adjacent URL                | 7 blob versions of `.env.example` (first at `3bfe107`)           | yes (`.env.example:2-3`) | **(c) public by design** — the publishable key and project URL ship in the client bundle to every browser; RLS is the boundary, per Supabase's own model. Listed because it is the only _production_ credential in the repo |

**Live secrets requiring rotation: none found.** The scan says what it says about these patterns
over reachable blobs; it is not a proof about every conceivable secret shape (a raw hex API key
with no recognizable prefix and no `X=` assignment would evade it).

## 3. `.gitignore` coverage and the gaps

Present and correct: `.env`, `.env.*` (basename-matched, so `apps/web/.env.local` and
`supabase/functions/.env` are covered), `!.env.example` carve-out, build outputs.

Gaps that would let a secret in tomorrow:

- **`.npmrc` is tracked** (contents today: two harmless pnpm flags). An `_authToken` line added
  during any registry auth would commit silently. Ignore-with-checked-in-example is the usual
  shape.
- **No `*.pem` / `*.key` / `*.p12` patterns** — a certificate or key file dropped anywhere
  commits.
- **`data/raw/Chism_Books.xlsx` is the gap that already fired**: the gitignore names its two
  siblings (`Library_App_list.xlsx`, `library_connected_series.csv` — both untracked ✓) but not
  this file, which is tracked. See §4.
- No `.vercel/` pattern (directory doesn't currently exist locally; `project.json` there carries
  org/project ids if Vercel CLI is ever run in-repo).

## 4. Not secrets, but decisions to make before flipping public

- **`data/raw/Chism_Books.xlsx` — tracked at HEAD, 272 KB, since the initial commit `2378ffb`.**
  The real library spreadsheet. Columns include `GC Read` and **`TC Read`** — reading records for
  a **second person**, not only the owner. Your own library data is yours to publish; the second
  reader's column is the part flagged hardest. Removing it from HEAD hides nothing from history
  (the brief's own premise), so the decision is publish-as-is vs. history rewrite before the repo
  ever goes public — the one moment a rewrite still works.
- **The derived seeds are the same data in JSON**: `data/personal_seed.json` (290 real books,
  named in AGENTS.md as "290 real books"), `reverie_design_seed.json/.csv`,
  `starter_books.json`, and `supabase/seed.sql`'s dev library. Flagged for the same decision, not
  assumed.
- **Personal email addresses.** `gchism94@gmail.com` appears in _content_ once at HEAD —
  `SECURITY.md:5`, deliberately, as the vulnerability contact (an alternative exists:
  `contact@reveriereads.app`). It also rides **commit author metadata**, along with
  `gchism@arizona.edu` (an employer address) — publishing the history publishes both, and no
  file-level edit changes that; only a rewrite or GitHub's noreply convention going forward does.
  Everything else email-shaped is fixture/local noise (`*@example.com`, `*@reverie.local`,
  `admin@email.com` in `supabase/config.toml`'s local auth template).
- **Sentry DSN committed as a default** — `.env.example:11` since `0e679e6` (2026-07-26). DSNs
  are client-publishable by design (it ships in the bundle when set), so not a secret — but as a
  committed default, every fork that copies the example reports its errors into your Sentry
  project. Yours to keep or blank.
- **Production project ref `tzimctugmzuadrsitnpr`** appears at HEAD in `.env.example` and
  `docs/reference/DEPLOY.md`. Both are consistent with it being client-visible anyway; listed for
  completeness.
- **`https://reverie.app`** is the geo function's fallback contact
  (`supabase/functions/geo/index.ts:25`) — a domain that is not obviously yours
  (`reveriereads.app` is). A stranger's domain as our Nominatim contact-of-record is a
  correctness smell, not a secret; noted, not fixed.
- The Steppe project ref (`cywp…loem`) appears only in `docs/backlog/BACKLOG.md` as the MCP
  wrong-project note — another project's identifier in our docs; harmless, owner's call.

## 5. Rotation mechanics, per finding class

Nothing found _requires_ rotation. For completeness, if the production Supabase keys were ever to
rotate:

- **Legacy JWT-based anon / service-role keys rotate together** (both derive from the project JWT
  secret): rotating invalidates every signed-in session, requires updating the Vercel env
  (`VITE_SUPABASE_ANON_KEY`) and any local `.env.local`s, and **functions need nothing** — the
  platform injects `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY` at runtime, so new values
  arrive without a redeploy. A Vercel env change requires a redeploy of the _site_ to take effect
  (build-time inlining via Vite).
- **New-style keys** (`sb_publishable_*` / `sb_secret_*`) rotate independently in the dashboard;
  same Vercel-env + site-redeploy consequence for the publishable key; no function redeploy.
- **`GOOGLE_BOOKS_KEY` / `HARDCOVER_TOKEN` / `ISBNDB_KEY` / `SENTRY_DSN`** live only as Supabase
  function secrets (`supabase secrets set …`) — updating a secret restarts functions with the new
  value; no code deploy. None of these values appear anywhere in git history (verified above).
- The **demo JWTs cannot be rotated** and don't need to be — they are the CLI's, not yours.

## 6. Existing tooling

**None.** No gitleaks, trufflehog, secretlint, husky, or any pre-commit hook exists in the repo,
and `ci.yml` (the only workflow) has no scanning step — the only secret handling CI does is
consuming GitHub-masked env for the deploy-preview placeholders. Recommending a scanner is PR-2
work, per the brief; this line records only the absence.
