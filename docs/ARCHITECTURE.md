# Architecture

Two parts: how the current prototype is built, and the proposed architecture for the
front-end / back-end rebuild.

---

## 1. Current prototype (where we are)

A single self-contained HTML file. No framework, no build server, no backend.

- **One file.** `lib_template.html` holds all HTML, CSS, and JS. The build step
  (`build/build.mjs`) injects the book dataset into a `/*__SEED__*/[]` placeholder to
  produce the runnable `Reverie_Library.html`.
- **Storage layer (`Store`).** A thin abstraction that tries, in order:
  `window.storage` (host-provided) → `localStorage` → in-memory. Personal data is keyed
  `reverie_v1`; cached cover URLs under `reverie_covers_v1`.
- **State (`DB`).** A single in-memory object (books, tbrs, collections, me, shared,
  syncCfg, theme, goal) persisted to the storage layer on every change. See
  `DATA_MODEL.md`.
- **Sharing (`Shared`).** Capability-keyed documents. A random share code identifies a
  shared list or club; anyone with the code can read/write it. Backends, in order:
  Supabase REST (if configured) → `window.storage` shared scope → local export/import
  codes. The UI polls every ~4s while a shared view is open.
- **Rendering.** Hand-written `render*()` functions per view, wired through a `go(view)`
  router that toggles `.view` sections.

**Why it's shaped this way:** it had to run as a single artifact with no server, work
offline, and be trivially portable. That ceiling is now the reason to rebuild: real
multi-device sync, real auth, and real multi-user collaboration need a backend.

### Limits we're rebuilding to escape
- Library lives only in one browser; no cross-device sync.
- "Household sync" and book clubs are capability-code only — no accounts, no identity,
  last-write-wins on a whole-document blob.
- Spoiler gating for read-alongs is client-side (honor-based).
- Cover/metadata enrichment runs client-side and ad hoc.
- ~260 KB of inlined JS in one file is hard to test and extend.

---

## 2. Proposed architecture (where we're going)

Goal: keep the offline-first, personal-power-tool feel, but add accounts, real sync,
and true multi-user clubs — without turning a cozy personal app into heavy infra.

### Shape: local-first client + thin sync backend

```
┌──────────────────────────────┐         ┌─────────────────────────────┐
│  CLIENT (front end)          │         │  BACKEND                    │
│  - UI + local DB (source of  │  sync   │  - Auth (accounts/identity) │
│    truth for the user)       │ ───────▶│  - Postgres (library, lists,│
│  - offline-capable           │ ◀────── │    clubs, reads, comments)  │
│  - optimistic writes         │ realtime│  - Realtime (live shares)   │
│  - cover/metadata fetch       │         │  - Edge fns: enrich, import │
└──────────────────────────────┘         └─────────────────────────────┘
            │                                          │
            ▼                                          ▼
   IndexedDB / local cache                   Object storage (cover cache,
                                             CSV uploads, backups)
```

**Local-first** means the client keeps a local copy and works offline; changes sync up
when connected. This preserves the snappy, private feel of the prototype while adding
multi-device and sharing. (If local-first proves heavy, the fallback is a conventional
client + REST/realtime API — same data model, simpler client.)

### Recommended stack (pragmatic, low-ops)

| Layer | Recommendation | Why |
|---|---|---|
| Front end | **React + TypeScript + Vite**, Tailwind for tokens | Component reuse across the many views; TS for the data model; Tailwind maps cleanly to the design tokens |
| Routing/state | TanStack Router/Query or a local-first lib (e.g. a sync engine) | Query-cache + sync fit the local-first model |
| Local store | **IndexedDB** (via a wrapper) | Holds the full library offline; bigger than localStorage |
| Backend | **Supabase** (Postgres + Auth + Realtime + Storage + Edge Functions) | One service covers auth, db, realtime, file storage, and serverless enrichment; already used by the prototype's share layer |
| Auth | Supabase Auth (email magic-link + OAuth) | Gives real identity for household members and club readers |
| Enrichment | Supabase Edge Functions calling Google Books → Open Library → Hardcover | Moves cover/metadata/release lookups server-side, cached, rate-limit-aware (see `DATA_SOURCES.md`) |
| Hosting | Static host (Vercel/Netlify/Pages) + Supabase | Cheap, simple, scales fine for this |

Nothing here is locked in — it's the low-friction default. The data model in
`DATA_MODEL.md` is what actually matters and is stack-independent.

### What the backend unlocks
- **Accounts + multi-device:** your library follows you; no more single-browser lock-in.
- **Household library:** a shared library space with member identities and roles.
- **Real clubs:** read-alongs and shared/club TBRs with per-user progress and identity,
  not whole-blob last-write-wins.
- **Server-enforced spoiler gating** (optional): the API can withhold comments past a
  reader's recorded progress instead of trusting the client.
- **Server-side enrichment & import:** covers, metadata, release dates, and Goodreads/
  StoryGraph CSV import processed in an Edge Function, cached for everyone.

### Proposed API surface (illustrative)
REST/RPC + realtime subscriptions, all row-level-security scoped to the signed-in user:
- `books` CRUD; bulk import; `reads` sub-resource (date/format/rating/notes).
- `lists` (TBRs/collections) CRUD + membership; `priority` flag.
- `households` + `household_members`; shared library scoping.
- `clubs`, `club_members` (progress), `club_comments` (unit-tagged, gated on read).
- `enrich(isbn|title)` and `import_csv(file)` as Edge Functions.

### Migration from the prototype
1. Lift the `DB` object shapes (`DATA_MODEL.md`) into a Postgres schema (relational
   version already sketched there).
2. Reuse `personal_seed.json` as the first account's seed import.
3. Port the merge engine, CSV importer, and spoiler-gating logic — they're already
   written and unit-tested in the prototype; they become server functions / typed client
   utilities.
4. Rebuild the UI from `design/DESIGN_SYSTEM.md` and `DESIGN_PROMPT.md`.

### Open decisions (resolve early in the build phase)
- Local-first sync engine vs. conventional REST + cache.
- Whether spoiler gating must be server-enforced or honor-based is fine.
- Household model: shared single library vs. linked personal libraries.
- Whether to keep capability-code sharing (frictionless) alongside accounts.
