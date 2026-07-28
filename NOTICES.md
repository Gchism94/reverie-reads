# Notices — third-party content, data, and dependencies

The proprietary license in [`LICENSE`](LICENSE) covers only the original source code of
this repository. It does **not** cover the third-party material described here, which is
governed by its own terms and, in the case of content, is **not the repository owner's to
license**.

## Book cover images — not covered, not ours to license

Book cover images displayed or cached by the app are retrieved from **Google Books**,
**Open Library**, and **Hardcover**, or uploaded by users. **Each cover image remains the
property of its rights holder** — typically the book's publisher. They are not the
repository owner's to license and are not granted to you under `LICENSE`. No ownership of
any cover image is claimed. The app fetches and caches these images to display a reader's
own library; it does not redistribute them as a standalone image collection.

## Bibliographic and metadata records — not covered

Titles, authors, series data, publication details, ISBNs, and related bibliographic and
metadata records are drawn from the **Hardcover API** and the **Google Books API** and are
used under those providers' respective API terms of service. These records are not
licensed to you by this repository.

## User-supplied content — belongs to the user

Content a user supplies — uploaded cover images, notes, reviews, ratings, tags, shelves —
belongs to that user. It is not covered by `LICENSE` and is not the repository owner's to
license.

## API usage and keys

Use of the Hardcover and Google Books APIs is subject to **Hardcover's** and **Google
Books'** terms of service. **API keys and service-role credentials are never committed to
this repository** — they live only in deployment environment secrets. Nothing here grants
you access to any provider's API.

## "Understand Anything" (MIT)

The "Understand Anything" tooling (MIT-licensed) is **not currently vendored or referenced**
in this repository. If it is added to the training-fork tooling in the future, its MIT
license and copyright notice must be reproduced here.

## Dependency licenses (production tree)

The inventory below is **generated**, not written from memory. Regenerate with:

```bash
pnpm licenses list --prod            # human-readable table
pnpm licenses list --prod --json     # machine-readable (used to build the table below)
```

### Summary (type → count)

| License      |  Count | Notes                                 |
| ------------ | -----: | ------------------------------------- |
| MIT          |     34 | permissive                            |
| Apache-2.0   |      2 | permissive (patent grant)             |
| BSD-2-Clause |      1 | permissive (`leaflet` — the map view) |
| 0BSD         |      1 | permissive (public-domain-equivalent) |
| Unlicense    |      1 | public-domain-equivalent              |
| **Total**    | **39** | 5 distinct license types              |

**All production dependencies are permissive.** No GPL, LGPL, AGPL, MPL, or other
reciprocal/copyleft licenses — and no non-OSI / ethical-source licenses — are present in the
production dependency tree. (The map view uses core `leaflet` (BSD-2-Clause) directly; the
`react-leaflet` wrapper, which was Hippocratic-2.1, was removed.)

### Full inventory (appendix)

| Package                                | Version  | License      |
| -------------------------------------- | -------- | ------------ |
| `tslib`                                | 2.8.1    | 0BSD         |
| `dexie`                                | 4.4.4    | Apache-2.0   |
| `xlsx`                                 | 0.20.3   | Apache-2.0   |
| `leaflet`                              | 1.9.4    | BSD-2-Clause |
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

_Generated with `pnpm licenses list --prod` on the production dependency tree. Re-run after
dependency changes to keep this current._
