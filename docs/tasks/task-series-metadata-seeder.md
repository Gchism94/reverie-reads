# Shared series metadata seeder

Status: implemented on `codex/series-metadata-seeder`; production rollout pending.

## Problem

The app had two distinct defects that looked like one:

1. The book-page series strip treated the number of entries currently known to one account as the
   total length. One known membership therefore rendered `#3 of 1` even when Reverie did not know
   the series length.
2. Bulk Add narrowed a catalog result before intake and discarded Hardcover's series name and
   position, writing every added book as standalone.

The existing corpus completion pass could incidentally fill a series when some other objective
field was missing, but it deliberately did not consider a blank series a generic gap. That safety
rule is correct—most books are standalones—but it left no dedicated mechanism to check series
information or remember that a source had already been consulted.

## Implemented model

Series discovery is a shared corpus operation, not repeated work for every reader.

- Every `works` row has an independent `series_check_state`, `series_checked_at`, and source.
- States distinguish never checked, unresolved identity, matched-with-no-series, found, and waiting
  for review. `no_series` is a source observation and never writes publication status or asserts
  standalone.
- Unresolved checks become eligible after 30 days. Stable found/no-series results become eligible
  after 180 days. Pending review does not churn through the source pipeline.
- The administrator corpus completion control processes at most 400 works per run and uses the
  existing source throttling/cache. It is resumable from stored state.
- High-confidence evidence may fill a blank shared series or confirm the same normalized name.
  Medium-confidence matches and all conflicts enter `work_series_suggestions`.
- Accept/dismiss is explicit in Review and shows current and proposed series/position side by side.
- Personal copies are not rewritten. Their owner still chooses “Use shared details,” preserving the
  established personal/shared metadata boundary.
- Bulk Add now preserves a high-confidence Hardcover series claim and position at intake.
- The book-page strip only says “of N” when an explicit series-length claim or additional canonical
  entries actually establish N.

## Keeping it current

Corpus administrators use **Settings → Complete shared corpus & series info**. The eligible count is
computed from both the ordinary metadata clock and the independent series clock. Uncertain positive
matches appear under **Review → Corpus series matches**.

This deliberately does not fabricate a complete reading order from the books one household owns.
Canonical missing-book slots still come from the established per-series Hardcover refresh or manual
series builder. A later shared canonical-series catalog may eliminate that remaining per-series
refresh, but it must preserve source provenance, tombstones, reader order, and the explicit
personal/shared adoption boundary before replacing it.

## Verification

- rendered tests prove one known entry does not display `of 1`;
- bulk-intake tests prove series name, position, and claim provenance survive;
- model tests cover the independent 30/180-day clocks and review routing;
- pgTAP covers high-confidence apply, medium/conflict review, accept/dismiss, audit history, RLS,
  grant-layer anonymous refusal, and dirty-ACL repair across every API role and operation;
- full local database suite: 978 assertions.
