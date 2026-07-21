# Security policy

## Reporting a vulnerability

Email **`SECURITY_CONTACT`** _(placeholder — to be filled in by the repository owner)_ with
a description of the issue and steps to reproduce.

**Please do not open a public issue, pull request, or discussion for a security matter.**
Report privately so the issue can be fixed before it's disclosed.

## Privacy posture

Reverie is a personal library. Its data model is built to keep a reader's data theirs:

- **A reader's shelves and library are private by default.**
- **Reading statistics, Wrapped, reading goals, and all analytics are owner-only and
  enforced at the database level** via Postgres row-level security (RLS) — not merely
  hidden in the UI. A user's rows are readable only by that user.
- **Sharing is opt-in and explicit.** Some features let a user deliberately share
  specific data — shared reading lists, book clubs, and capability-code links. Anything a
  user chooses to share through one of those paths is, by design, visible to the people
  they share it with. Outside those explicit paths, data stays private. We do **not** claim
  any user-shareable item is "never public."

## Secrets

**API keys and service-role credentials are never committed to this repository.** They
live only in deployment environment secrets (Vercel / Supabase). The Supabase publishable
anon key is client-safe by design; the service-role key and provider API keys are not, and
are never shipped to the client or checked in.
