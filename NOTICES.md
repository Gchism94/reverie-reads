# Notices — third-party content, dependencies, fonts, and data

The [AGPL-3.0 license](LICENSE) covers the original source code of this repository, and
the [CC0 dedication](LICENSE-CORPUS) covers the published book-metadata corpus. Neither
covers the third-party material described here, which is governed by its own terms and,
in the case of content, is **not the repository owner's to license**.

Under AGPL-3.0 distribution, preserving third-party license and attribution notices is a
compliance obligation, not a courtesy — this file is that obligation discharged, and the
"what ships" reasoning below is recorded so the next sweep starts from arguments instead
of assumptions.

## What counts as "distributed", and why transitives are listed

Two artifacts leave this repository: the **built frontend bundle** (Vite output deployed
to Vercel) and the **Supabase Edge Functions** (Deno code deployed server-side; under
AGPL §13, offering the app over a network is the trigger that makes server-side code's
licensing matter too).

**Transitive dependencies are listed, deliberately.** MIT, BSD, and Apache-2.0 all
condition redistribution on preserving the license/notice text, and a minified bundle
_is_ a redistribution of transformed copies of every package bundled into it — the
obligation attaches to what is in the artifact, not to what `package.json` names
directly. The inventory below is the full production dependency tree (`--prod`), which
over-approximates the bundle (tree-shaking may drop some packages entirely): listing a
package that didn't ship is harmless noise; omitting one that did is non-compliance, so
the tree is the safer boundary and cheaper than per-bundle attribution analysis.

**devDependencies are excluded, with reasoning**: build and test tooling (Vite, esbuild,
TypeScript, Tailwind, ESLint, Prettier, Vitest, Playwright, and their trees) transforms
or checks the code but its own code does not ship in the artifact. Two knowing
exceptions where build tools inject small runtime snippets into the output — Vite/Rollup
module-loading helpers (MIT) and Tailwind's Preflight reset (MIT, derived from
modern-normalize, MIT) — are attributed here voluntarily to close that gap.

## Dependency licenses (production tree)

The inventory is **generated**, not written from memory. Regenerate with:

```bash
pnpm licenses list --prod            # human-readable table
pnpm licenses list --prod --json     # machine-readable (used to build the table below)
```

### Summary (type → count)

| License      |  Count | Notes                                 |
| ------------ | -----: | ------------------------------------- |
| MIT          |     39 | permissive                            |
| Apache-2.0   |      2 | permissive (patent grant)             |
| BSD-2-Clause |      1 | permissive (`leaflet` — the map view) |
| 0BSD         |      1 | permissive (public-domain-equivalent) |
| Unlicense    |      1 | public-domain-equivalent              |
| **Total**    | **44** | 5 distinct license types              |

**All production dependencies are permissive and AGPL-3.0-compatible.** No reciprocal /
copyleft licenses (GPL, LGPL, MPL), no non-commercial terms, no ethical-source or other
non-OSI licenses, and nothing requiring more than license/notice preservation is present
in the production tree. (The map view uses core `leaflet` (BSD-2-Clause) directly; the
`react-leaflet` wrapper, which was Hippocratic-2.1, was removed in an earlier pass.)

**Dual licensing**: no package in the production tree is offered under a license choice
requiring an election by this project; every entry below carries a single declared
license. `xlsx` is SheetJS **Community Edition** under Apache-2.0 — the Pro edition is a
separate commercial product this project does not use.

### Edge Functions (server-side, not covered by the pnpm scan)

The deployed Edge Functions import exactly one external package, resolved by Deno at
deploy time rather than through `package.json` — which is why the pnpm scan misses it
and why an earlier revision of this file omitted it:

| Package                    | Version | License    | Notes                                                                                                                                                                             |
| -------------------------- | ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@imagemagick/magick-wasm` | 0.0.35  | Apache-2.0 | Wraps **ImageMagick** compiled to WebAssembly; the embedded ImageMagick is separately licensed under the ImageMagick License (permissive, Apache-2.0-style) — both notices apply. |

Everything else in `supabase/functions/` uses Deno's built-in APIs only. Regenerate this
section by grepping the functions for external import specifiers
(`npm:` / `jsr:` / `https:`).

### Full inventory (appendix)

| Package                                | Version  | License      |
| -------------------------------------- | -------- | ------------ |
| `tslib`                                | 2.8.1    | 0BSD         |
| `dexie`                                | 4.4.4    | Apache-2.0   |
| `xlsx`                                 | 0.20.3   | Apache-2.0   |
| `leaflet`                              | 1.9.4    | BSD-2-Clause |
| `@dnd-kit/accessibility`               | 3.1.1    | MIT          |
| `@dnd-kit/core`                        | 6.3.1    | MIT          |
| `@dnd-kit/modifiers`                   | 9.0.0    | MIT          |
| `@dnd-kit/sortable`                    | 10.0.0   | MIT          |
| `@dnd-kit/utilities`                   | 3.2.2    | MIT          |
| `@sentry/browser`                      | 10.62.0  | MIT          |
| `@sentry/browser-utils`                | 10.62.0  | MIT          |
| `@sentry/core`                         | 10.62.0  | MIT          |
| `@sentry/feedback`                     | 10.62.0  | MIT          |
| `@sentry/react`                        | 10.62.0  | MIT          |
| `@sentry/replay`                       | 10.62.0  | MIT          |
| `@sentry/replay-canvas`                | 10.62.0  | MIT          |
| `@supabase/auth-js`                    | 2.108.2  | MIT          |
| `@supabase/functions-js`               | 2.108.2  | MIT          |
| `@supabase/phoenix`                    | 0.4.4    | MIT          |
| `@supabase/postgrest-js`               | 2.108.2  | MIT          |
| `@supabase/realtime-js`                | 2.108.2  | MIT          |
| `@supabase/storage-js`                 | 2.108.2  | MIT          |
| `@supabase/supabase-js`                | 2.108.2  | MIT          |
| `@tanstack/history`                    | 1.162.0  | MIT          |
| `@tanstack/query-core`                 | 5.101.4  | MIT          |
| `@tanstack/query-persist-client-core`  | 5.101.4  | MIT          |
| `@tanstack/react-query`                | 5.101.4  | MIT          |
| `@tanstack/react-query-persist-client` | 5.101.4  | MIT          |
| `@tanstack/react-router`               | 1.170.16 | MIT          |
| `@tanstack/react-store`                | 0.9.3    | MIT          |
| `@tanstack/router-core`                | 1.171.13 | MIT          |
| `@tanstack/store`                      | 0.9.3    | MIT          |
| `@types/react`                         | 19.2.17  | MIT          |
| `cookie-es`                            | 3.1.1    | MIT          |
| `csstype`                              | 3.2.3    | MIT          |
| `iceberg-js`                           | 0.8.1    | MIT          |
| `react`                                | 19.2.7   | MIT          |
| `react-dom`                            | 19.2.7   | MIT          |
| `scheduler`                            | 0.27.0   | MIT          |
| `seroval`                              | 1.5.4    | MIT          |
| `seroval-plugins`                      | 1.5.4    | MIT          |
| `use-sync-external-store`              | 1.6.0    | MIT          |
| `zustand`                              | 5.0.14   | MIT          |
| `isbot`                                | 5.1.44   | Unlicense    |

_Generated with `pnpm licenses list --prod` on the production dependency tree. Re-run
after dependency changes to keep this current._

## Fonts

**No font files ship in the distributed artifact.** All eighteen typefaces load at
runtime from the Google Fonts CDN (per-skin `<link>` stylesheets in
`apps/web/index.html`); the app distributes URLs, not font bytes, so font-license
redistribution obligations do not attach to the artifact. Listed anyway — fonts are
routinely missed, and if any typeface is ever self-hosted, its license terms attach at
that moment:

| Typeface (skin)                           | License                   |
| ----------------------------------------- | ------------------------- |
| Fraunces, Hanken Grotesk (tryst)          | SIL Open Font License 1.1 |
| Cormorant Garamond, Spectral (grimoire)   | SIL Open Font License 1.1 |
| Space Grotesk, Space Mono (aphelion)      | SIL Open Font License 1.1 |
| Playfair Display, Libre Franklin (marrow) | SIL Open Font License 1.1 |
| Libre Caslon Text, Courier Prime (umbra)  | SIL Open Font License 1.1 |
| EB Garamond, Caveat (folio)               | SIL Open Font License 1.1 |
| Bitter, Varela Round (hearth)             | SIL Open Font License 1.1 |
| Source Serif 4, Archivo (almanac)         | SIL Open Font License 1.1 |
| Baloo 2, Karla (bloom)                    | SIL Open Font License 1.1 |

All are OFL-1.1 (verified against Google Fonts' per-family license metadata). OFL
requires attribution and license preservation only on redistribution of the font
software itself, which this repository does not do.

## Book cover images — not covered, not ours to license

Book cover images displayed or cached by the app are retrieved from **Google Books**,
**Open Library**, and **Hardcover**, or uploaded by users. **Each cover image remains the
property of its rights holder** — typically the book's publisher. They are not the
repository owner's to license and are not granted to you under `LICENSE` or
`LICENSE-CORPUS`. No ownership of any cover image is claimed. The app fetches and caches
these images to display a reader's own library; it does not redistribute them as a
standalone image collection.

## Bibliographic and metadata records — third-party sources

Titles, authors, series data, publication details, ISBNs, and related records are drawn
from the **Hardcover API**, the **Google Books API**, and **Open Library**, and are used
under those providers' respective terms. The CC0 corpus dedication
([`LICENSE-CORPUS`](LICENSE-CORPUS)) covers only rights this project itself holds in its
published dataset (selection/arrangement/compilation); it cannot and does not relicense
any provider's records.

## Reader data — belongs to the reader, never published

Shelves, ratings, favourites, reading statuses and history, taste vectors, moods, notes,
reviews, goals, and reading statistics belong to the reader who created them. Reader
data is not published, is not part of the corpus, and is not licensed by anything in
this repository.

## API usage and keys

Use of the Hardcover and Google Books APIs is subject to **Hardcover's** and **Google
Books'** terms of service. **API keys and service-role credentials are never committed to
this repository** — they live only in deployment environment secrets. Nothing here grants
you access to any provider's API.
