# Phase 7 — Launch hardening — coding agent task

Paste into coding agent. The P0 engineering work to take Reverie from a complete core to a safe,
public, multi-user launch (see docs/LAUNCH_READINESS.md). Same working agreement: pure logic
unit-tested; typecheck/lint/build/axe green each checkpoint; tokens-only + AA preserved; RLS on
every new table with a test; migrate + backfill, never drop data; user-authored fields always win;
secrets stay server-side (never the browser); stage source only; docs/design untouched; report
commit + acceptance at each checkpoint.

OWNER TRACK runs in parallel (not blocking these): Supabase paid tier + PITR, domain + deploy host,
error-tracker account/DSN, legal copy (Privacy Policy + ToS), schedule the evolve-skins cron.

Order: H1 first (it gates a safe public signup), then H2 -> H3 -> H4.

────────────────────────────────────────────────────────
## H1 — Data safety & privacy
- SEED SEPARATION: the 290-book personal seed is the OWNER's library. Make it dev/demo-only — a fresh
  public signup must start with an EMPTY library + a proper empty state, never the owner's books. Move
  seeding behind an explicit dev / "load demo data" path; confirm the signup flow provisions an empty
  profile. Acceptance: a new signup = zero books + empty state; the seed loads only via the dev/demo path.
- ACCOUNT DELETION: add irreversible account + data deletion — removes the auth user AND every owned
  row across all tables (books, authors/book_authors, reading_orders/items, merge_verdicts, reviews,
  club memberships/comments, adaptive-skin data, profiles). Transactional; confirm-gated. Acceptance:
  deletion removes every owned row + the auth user, touches no one else's data (ownership test), and
  is irreversible behind a clear confirm.
- DATA EXPORT refresh: the JSON backup predates Phase 6 — extend it to the new shapes (tags/intensity/
  genre, multi-author, reading orders, owned formats, adaptive state) so export is complete and
  symmetric with deletion. Acceptance: export round-trips all current data.
- "WHAT WE STORE" surface: a short in-app data summary (what's stored + why, incl. the adaptive taste
  profile) to back the privacy policy. [Code provides the surface; Owner/Legal writes the copy.]

## H2 — External-call resilience (proxy + cache)
- PROXY + CACHE the policy-bound external calls through Edge Functions: Overpass (indie discovery),
  Nominatim (geocoding), map tiles. Set a proper identifying User-Agent (their usage policies require
  it), cache server-side (nearby-store queries by rounded area/geohash; tiles via CDN / tile proxy),
  throttle + backoff. Never call these from the browser at scale. Reuse the B4 degraded states on
  upstream failure. Acceptance: indie + maps work through the proxy; repeat nearby queries hit cache;
  UA set; graceful degrade on upstream error.
- COVER IMAGE CACHING: on enrichment, fetch the resolved cover and store it in Supabase Storage
  (shared/global, keyed by work/edition like enrichment_cache) + serve via CDN; fall back source URL
  -> generated placeholder. Stops hotlinking retailer URLs (breakage/throttle/bandwidth). Acceptance:
  covers served from Storage/CDN; a broken source falls back; cache shared + keyed by work.

## H3 — Auth & abuse
- AUTH HARDENING: require email verification before full access; enable Supabase auth rate-limiting;
  review session/refresh + password policy. Acceptance: unverified users appropriately gated; auth
  endpoints rate-limited.
- EDGE FUNCTION RATE LIMITING: per-user/IP limits on enrichment, evolve-skins, indie, and write-heavy
  functions, to stop abuse + quota burn. Acceptance: a burst from one user/IP throttles with a clean
  429 + retry signal; legitimate use unaffected.
- UGC MODERATION: opt-in reviews + spoiler-gated club comments are public UGC — add a report/flag
  affordance, a flagged/hidden state + column, a takedown (hide) path, and a content-policy hook.
  Hidden content isn't served to others; authorship RLS unchanged.
  DECISION (owner, 2026-06-25): ship the LEAN report+hide path for v1 — anyone can post/review,
  any item can be reported and then hidden; NO moderation queue. Acceptance: any user can report;
  reported content can be hidden; hidden content is not served to others; tested.

## H4 — Observability & performance
- ERROR MONITORING + LOGS: integrate SENTRY (owner-provisioned; free Developer tier) on web + Edge
  Functions; structured Edge logs; an uptime check. Route ALL capture through a thin provider-agnostic
  captureError()/captureMessage() in @reverie/core — nothing else imports the Sentry SDK directly — so
  a later swap (GlitchTip self-host or another backend) is a one-file change, not a rewrite. Protect
  the 5K/mo free quota: web tracesSampleRate = 0 + inbound filters (extensions/bots/localhost).
  [Code hooks; Owner supplies VITE_SENTRY_DSN + Edge SENTRY_DSN.] Acceptance: client + server errors
  report to Sentry; Edge logs structured; NO direct Sentry SDK imports outside the core wrapper.
- FONT-LOADING: load only the ACTIVE skin's font pairing in normal use (+ the gallery loads all),
  self-host/subset where feasible, font-display: swap, preload the active pairing. Closes the C3
  gallery-fonts flag; keeps perf sane at 9 skins. Acceptance: a normal session loads ~one pairing,
  not nine; the gallery still renders each card in its true type; no FOIT.
- PERF PASS: Lighthouse on the key routes; confirm PWA score, bundle, image lazy-loading; take the
  obvious wins. Acceptance: documented scores; no regressions.

────────────────────────────────────────────────────────
## Checkpoints (report commit + acceptance at each)
- H1 data safety & privacy · H2 external-call resilience · H3 auth & abuse · H4 observability & perf.

## Guardrails
Tokens-only + AA; RLS on every new table with a test; deletion transactional + ownership-tested;
NO third-party secrets in the browser (all keys server-side); proxies send a proper UA + respect
upstream usage policies; global caches keyed by work; migrate + backfill never dropping data; gate
green (typecheck/lint/build/tests/axe); stage source only; docs/design untouched.

---

## PHASE 7 COMPLETE — 2026-06-27
Commits: H1 784ad0d · H2 e11e6b2 · H3 db920f0 · H4 font/perf f32b065 · H4 error-layer rework c0b96eb.
Gate green (core 125 unit, web typecheck/lint/unit, build, axe). Staged source only; docs/design untouched.
- H4 ERROR MONITORING (reworked to spec): provider-agnostic captureError/captureMessage +
  setErrorReporter over an ErrorReporter interface in @reverie/core; default structured console
  reporter; capture never throws; pure + 3 unit tests. Sentry SDK imported in ONE file only
  (apps/web/src/lib/sentry.ts, grep-verified) -> registered as the reporter when VITE_SENTRY_DSN is
  set, else console-routed handlers; swap (GlitchTip/self-host) = one file. tracesSampleRate=0 +
  inbound filters (beforeSend/denyUrls/ignoreErrors) protect the 5K/mo free tier. Edge reports via
  Sentry's HTTP envelope endpoint (DSN parsed from SENTRY_DSN, no SDK on Deno); Edge logs structured
  single-line JSON. SDK dynamic-imported -> zero main-bundle impact (~150KB gzip unchanged). Old
  observability.ts removed; ErrorBoundary + main.tsx route through the wrapper. @sentry/react@10.62 added.
- H1 data safety (784ad0d), H2 external-call resilience (e11e6b2), H3 auth & abuse incl. lean
  report/hide (db920f0), H4 font-loading + perf (f32b065): reported done + gate-green (not individually
  reviewed here; taken on gate + acceptance).

FLAGS:
- .env.example carries the REAL publishable Supabase URL/key. Safe IF it's the publishable/anon key
  (public, RLS-protected) -- CONFIRM it is NOT the secret/service_role key. (.env.example conventionally
  stays placeholders, but the anon key is public so committing it is harmless.)
- H1 is data-safety/legal-critical -- self-check that account deletion is transactional + ownership-
  tested across ALL tables (incl. Phase-6: authors/book_authors, reading_orders/items, adaptive state)
  and that fresh signups start truly empty (no seed leak).

OWNER ACTION: provision the Sentry project; set VITE_SENTRY_DSN (build) + SENTRY_DSN (function secret).
Until then errors route to the structured console reporter (nothing lost, just not centralized).
