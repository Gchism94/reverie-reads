# Phase 7 — Launch hardening — Claude Code task

Paste into Claude Code. The P0 engineering work to take Reverie from a complete core to a safe,
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
  OWNER DECISION: alternatively, defer public UGC for v1 (keep reviews/clubs private or disabled) to
  sidestep moderation entirely — if chosen, H3 reduces to gating rather than a moderation path.
  DEFAULT: build the lean report+hide path. Acceptance (default): any user can report; reported
  content can be hidden; hidden content not served; tested.

## H4 — Observability & performance
- ERROR MONITORING + LOGS: integrate an error tracker (e.g. Sentry) on web + Edge Functions;
  structured Edge logs; an uptime check. [Code hooks; Owner supplies the DSN.] Acceptance: client +
  server errors report; Edge logs structured.
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
