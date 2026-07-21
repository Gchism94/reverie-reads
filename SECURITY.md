# Security policy

## Reporting a vulnerability

Email **Greg Chism — gchism94@gmail.com** with a description of the issue and steps to
reproduce.

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
- **Location (the indie-bookstore finder).** The `/indie` finder can use your device
  location, requested **only through the browser's geolocation permission prompt** on a
  deliberate tap — or you can type a place name instead. If you decline or it is
  unavailable, it degrades to manual entry, and with no location at all it falls back to
  the online storefronts (Bookshop.org / Libro.fm); it never blocks. A resolved location is
  held **only in the browser session** (`sessionStorage`, cleared when the session ends) —
  it is **never written to the database or stored on our servers**. To turn a point into a
  place label and to find nearby stores, the coordinates are sent transiently — proxied
  through our own `geo` edge function, not from your browser directly — to OpenStreetMap's
  Nominatim and Overpass services (contact User-Agent, area-rounded shared cache; not
  retained as a user record). Basemap tiles load from the CARTO CDN, so — because the map
  centers on your point — CARTO receives tile requests that reveal the **approximate map
  area, not your precise coordinates**.

## Secrets

**API keys and service-role credentials are never committed to this repository.** They
live only in deployment environment secrets (Vercel / Supabase). The Supabase publishable
anon key is client-safe by design; the service-role key and provider API keys are not, and
are never shipped to the client or checked in.
