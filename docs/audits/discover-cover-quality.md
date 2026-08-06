# Discover cover quality audit — what zoom=2 actually returns

Audited 2026-08-06 on `fix/discover-cover-quality` (off `main` @ `0a9caff`). Phase 1, audit only —
no fix proposed here. Live reproduction against the local authenticated app with **real network**
(nothing stubbed): the Horror rail was served by the local `releases` edge function (same code as
prod, `mode: 'discover'`, 12 hits), and every Google Books image fetch below hit
`books.google.com` directly, with dimensions, bytes and hashes recorded. The four screenshot
volumes were all present in the live payload.

## Headline

- **`zoom=2` is not "the same cover, larger." For two whole classes of Google volume it is a
  different, degenerate asset served at HTTP 200** — a 300×48 scan strip for old library-scan
  volumes, and the "image not available" plate at a previously unknown 300×391 size for
  metadata-only volumes. The upgrade rewrite doesn't degrade gracefully on these; it
  **manufactures** the breakage — `zoom=1` was a real, correct cover for every single broken
  volume sampled (§1).
- **The PR #58-era plate fix still works for the sizes it knows and cannot see the new one** (§2):
  it matches 575×750 and 128×170 exactly; the `zoom=2` plate is 300×391 — byte-identical across
  volumes (one sha256 for three different books) — and sails through. The zoom rewrite
  reintroduced the plate case at a size the guard never knew existed.
- **There is no reliable client-side pre-render signal** (§3). The strongest observed signal —
  every degenerate response is `image/png`, every real cover `image/jpeg`, 21/21 in this sample —
  lives in a response header an `<img>` cannot read cross-origin. What IS readable, after load, is
  `naturalWidth/naturalHeight`, and the degenerate sizes are **stable and enumerable**: 300×48
  (zoom=2 strip), 575×92 (zoom=0 strip), 300×391 (zoom=2 plate) — same mechanism as the existing
  plate check, three more entries' worth of knowledge.
- **Row one vs row two is not a code path** (§4). Same component, same chain; the difference is
  the Google _asset class_ of the volume the rail surfaced, which correlates with rail position
  only through the discover shelf's fresh-first ordering.

## 1. What each zoom actually returns, per volume

All fetched live from `books.google.com/books/content?id=…&printsec=frontcover&img=1&zoom=Z`;
dims from the decoded image, hashes sha256 (first 12), all responses HTTP 200.

| volume                        | id (class)                     | zoom=1 (the API's own link)    | zoom=2 (our 'thumb' upgrade)                       | zoom=0 (our 'full' upgrade)                        |
| ----------------------------- | ------------------------------ | ------------------------------ | -------------------------------------------------- | -------------------------------------------------- |
| Needful Things                | `ylLoGsee8YcC` (scan)          | **128×192 jpeg, real cover**   | **300×48 png strip** (318 B)                       | **575×92 png strip** (590 B)                       |
| Misery                        | `KbMhAQAAIAAJ` (scan)          | **128×188 jpeg, real cover**   | **300×48 png strip** (742 B)                       | **575×92 png strip** (1.2 KB)                      |
| Thinner                       | `1YP-hfna5ewC` (scan)          | **128×210 jpeg, real cover**   | **300×48 png strip** (18.7 KB)                     | **575×92 png strip** (32.2 KB)                     |
| Dracula (2021 reissue)        | `WgmlzgEACAAJ` (metadata-only) | **128×198 jpeg, real cover**   | **300×391 png = THE PLATE** (`12557f8948b8`)       | **575×750 png = the known plate** (`3efa8c43e5b4`) |
| The Castle of the Carpathians | `TIjxzQEACAAJ` (metadata-only) | 128×128 jpeg (real, odd ratio) | **300×391 plate, byte-identical** (`12557f8948b8`) | 575×750 known plate                                |
| The Long Walk                 | `WXTWAAAAMAAJ` (scan/metadata) | 128×208 jpeg, real cover       | **300×391 plate, byte-identical** (`12557f8948b8`) | 575×750 known plate                                |
| The Electric Black (control)  | `W95CEAAAQBAJ` (modern ebook)  | 128×198 jpeg                   | 300×461 jpeg, real — upgrade works                 | 1988×3056 jpeg, real — upgrade works               |

Answers per volume, as asked:

- **Misery, Needful Things, Thinner — a different asset entirely, not a crop and not a larger
  render.** zoom≥2 returns a wide strip (aspect ~6:1) — a degenerate render of the scanned
  frontcover. In a 230×346 `object-cover` card a 300×48 strip is magnified ~7× and cropped to the
  centre sliver: the "single letter filling the card" in the screenshot. The near-empty ones
  (Needful Things' strip is 318 bytes) render as blank-ish smears. **Both** upgrade sizes are
  broken for this class — `full` (zoom=0) is a 575×92 strip, so book detail is exposed too.
- **Dracula — the plate, at a new size.** The 2021 reissue the fresh-first ordering surfaces is a
  metadata-only record: real 128×198 thumbnail at zoom=1, the no-cover plate at zoom=2 (300×391)
  and zoom=0 (575×750). The upgrade replaced a working cover with "image not available."
- **Control — the upgrade genuinely works** for modern-ebook volumes; this is why it exists and
  why "stop upgrading" has a real cost.

## 2. The PR #58-era plate fix: works, and blind to the new variant

`isGoogleNoCoverArt` rejects by exact dimensions: 575×750 (zoom 0/2/3, as then measured) and
128×170 (zoom=1). Measured today:

- The 575×750 plate still exists and is still byte-stable — the `full` upgrade's plate case **is
  still caught** and falls back correctly.
- At zoom=2 Google now serves the plate at **300×391** — byte-identical across volumes, so it is
  the same stock asset at a third size. The exact-size list doesn't contain it, so the `thumb`
  upgrade's plate case — the one Discover renders — **is not caught**. Named precisely: the fix
  still works for what it knew; the zoom=2 rewrite (which shipped later) reintroduced the case at
  a size the fix predates. Nothing regressed inside the fix itself.
- The strips (300×48 / 575×92) were never a plate and were never handled by anything.

## 3. Is there a pre-render signal? Plainly: no reliable client-side one

- **Response headers**: every degenerate response in the sample is `image/png`; every real cover
  is `image/jpeg` (21/21). But an `<img>` cannot read content-type cross-origin, and a CORS
  `fetch` to `books.google.com` is not something the display path can rely on. Also
  jpeg-vs-png-ness of _real_ covers is Google's choice, not a contract — this correlation is
  reported, not certified.
- **Content-length**: strips run 318 B – 32 KB, plates 9–16 KB, real covers 6–415 KB. Overlapping
  ranges; no threshold separates them. And headers are equally unreadable cross-origin.
- **Known hashes**: the plate is byte-stable per size (one sha256 per size across volumes) but a
  cross-origin `<img>` cannot hash bytes (canvas taint) — same reason #58 used dimensions.
- **What is readable, after load**: `naturalWidth/naturalHeight`, and the degenerate sizes are
  stable and enumerable — 300×48, 575×92, 300×391 (this sample; same mechanism as the existing
  575×750/128×170 list). Additionally the strips are structurally distinctive (aspect ratio ~6:1
  vs every real cover's ~0.6–0.77) independent of exact pixel values.

This changes the shape of any fix: whatever ships must either decide **before requesting** (only
upgrade volumes proven to have real large renders — information the API response itself does not
carry) or decide **at render** (load-time dimension check, the #58 mechanism, extended). There is
no header/hash shortcut in between.

## 4. Row one vs row two — same component, same path, different volumes

Both rows render the identical chain: `DiscoverHit.cover` (the API's zoom=1 thumbnail) →
`CoverImage thumb` → `coverCandidates` → `upgradeCoverUrl(…, 'thumb')` leads (zoom=2) with the
zoom=1 original as fallback. Nothing about row index changes the code.

The real variable is the **Google asset class** of each volume: modern ebooks (`…QBAJ` ids)
upgrade cleanly; old library-scan volumes (`…AAAMAAJ` / `…AQAAIAAJ`) return strips at zoom≥2;
metadata-only records (`…zgEACAAJ` — commonly recent reissues) return plates at zoom≥2. The
discover shelf orders fresh-first (`fetchDiscoverShelf`: published ≤2y, then ≤8y, then rest), and
fresh editions skew toward reissue/metadata-only records — so broken classes cluster toward the
front of the rail, but not exclusively: in today's live payload broken volumes appeared in both
rows (positions 2, 5, 7, 8). The screenshot's clean second row is that day's cache composition,
not a different code path.

## 5. Blast radius — everywhere the upgrade meets a Google hotlink

`coverCandidates` (and thus the zoom rewrite) runs in `CoverImage`, which is the cover for every
surface. The exposure is wherever the INPUT is a Google hotlink:

| surface                                                                             | google hotlinks reach it?                          | exposure                                                                       |
| ----------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Discover cards (`thumb`)                                                            | always — hits are Google hotlinks by construction  | strips (300×48) + plates (300×391), uncaught. The live defect.                 |
| Add-flow search results (`SearchResults`, `thumb`)                                  | always — same Google payload shape                 | identical to Discover. Confirmed same chain by code; same asset classes apply. |
| Cover sheet edition candidates (`coverSheet.ts`, both sizes)                        | yes — Google candidates offered at display time    | same two classes at both sizes.                                                |
| Book detail / flip (`full`) for a book whose stored `cover_url` is a Google hotlink | conditional                                        | strips (575×92) uncaught; plates (575×750) ARE caught by #58's existing check. |
| Library grid/spines/series/planner (`thumb`) for Google-hotlink books               | conditional                                        | strips + 300×391 plates, uncaught.                                             |
| Re-sharpen sweep (`resharpenCovers`)                                                | no — explicitly skips Google (display-only rule)   | none.                                                                          |
| Stored/ingested covers (the library norm)                                           | no — `isStoredCoverUrl` short-circuits the upgrade | none. This is the hotlink boundary holding.                                    |

The conditional rows depend on how many library books carry Google `cover_url`s: they exist
structurally (a book added from search keeps its Google hotlink forever — ingest refuses Google
by design, so nothing ever replaces it), but the dev seed has **zero**, and real-library counts
are unknown from here.

## 6. What this measurement does and does not settle (no fix proposed)

The decision the owner framed — "stop upgrading" vs "upgrade conditionally" vs "detect at render
and fall back" — now has its facts:

- `zoom=1` was a real cover for **every** broken volume sampled; the upgrade's value is real but
  confined to the modern-ebook class (where it is dramatic: 128px → 1988px on the control).
- No volume-level signal in the API payload distinguishes the classes before fetching (the id
  suffix pattern is suggestive — QBAJ/CAAJ/MAAJ — but is an undocumented observation, not a
  contract).
- Render-time dimensions are the only reliable client-side discriminator, the degenerate sizes
  are stable and enumerable, and the strips are additionally structurally distinctive by aspect
  ratio.
- Whatever ships, the guard must assert the RENDERED image (`naturalWidth/naturalHeight` of what
  actually loaded, or a screenshot-level check) — the earlier verification asserted the `src`
  attribute, which is exactly how a strip at HTTP 200 shipped green.

## Measured / inferred / unknown

- **Measured**: every number in §1 (live fetches, dims, bytes, hashes); the byte-identity of the
  300×391 and 575×750 plates across volumes; the live rail payload and per-card
  `naturalWidth/Height` on the authenticated app; zero Google hotlinks in the dev library.
- **Inferred**: the id-suffix ↔ asset-class correlation (consistent in this sample, undocumented);
  that prod's clean second row was cache composition (the local fn run reproduced breakage in
  both rows).
- **Unknown from here**: whether Google's plate/strip dimensions are stable across time and
  regions (the plate changed size at least once — that is how we got here); real-library counts
  of stored Google hotlinks.
