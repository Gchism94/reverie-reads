# Phase 0 Source Matrix — Verification Addendum

Verified: 2026-08-02 · against live source pages, not the matrix's memory
Applies to: docs/reverie-metadata-sourcing.md (Phase 0) and docs/discover-redesign.md (Phase B)
Next re-verification: before Phase B ingest begins, and at ISBNdb subscription time

## Verdict

The recommended stack is fully active, and the dumps-first architecture is now the posture the sources themselves demand, not just the one we chose. No pillar has degraded. Two license checks remain open; neither is an availability risk.

## Per-source status

**Open Library — ACTIVE, bulk-ready, and explicit about it.** Monthly dumps continue (editions/works/authors/ratings/reading-log), torrents available. The developer hub now states plainly that bulk import projects should use the dumps and that the APIs are not a bulk backend, with formalized API limits: 1 req/s anonymous, 3 req/s with a User-Agent identifying the app and a contact email. Consequences named: violators get blocked. Two changes since Phase 0:

- NEW: a `wikidata` dump (~700MB) of Wikidata records relevant to OL — currently authors only. This makes the OL↔Wikidata author crosswalk a join on shipped files rather than a SPARQL harvest. Phase B Stage 1 should consume it.
- Confirmed absent: no bulk cover dumps exist. The hotlink-only / ISBN-endpoint cover posture stands; there is no legitimate bulk-cover path to wish for.
- Their docs now demonstrate DuckDB `read_csv` directly against dump files — the exact ingest architecture Phase B proposes is the source's own documented workflow.

**Wikidata — ACTIVE, weekly.** Entity dumps fresh through 2026-07-31; `latest-all.json.bz2` ≈ 102GB; JSON dumps weekly and recommended, daily incremental add/change dumps available. P179/P1545 series extraction can come from a filtered full-dump pass or targeted SPARQL; for the bounded corpus, dump-filtering is the safer default (WDQS timeouts are real at scale).

**ISBNdb — ACTIVE, unchanged shape.** API 2.0 current (1.0 discontinued; keys carry over). ~111M titles claimed. Tiers still $14.99 / $35.99 / $99.99 / $299.99; Premium adds the bulk endpoint (up to 1,000 books/call) at 3 req/s, Pro 5 req/s. Still API-only — gap-filler, never spine, never in the published dataset. At Premium bulk rates, enriching a 200–500k corpus is a few hundred calls (hours, not weeks). OPEN ITEM: read the current redistribution clause and daily-call limits at subscription time, before any spend.

**LCSH / FAST — ACTIVE.** FAST is actively maintained (LC changes incorporated roughly monthly; searchFAST, linked-data service, and the FPOC process all live). OPEN ITEM: the Phase 0 flag on FAST's current OCLC license terms remains unresolved — verify before any FAST-derived data enters a published layer. LCSH via id.loc.gov is public domain and was not individually re-checked (lowest-drift source in the stack).

**BNB — STILL UNRESOLVED.** Not re-verified this pass. Remains off the plan; monitor the Share Family portal if UK legal-deposit coverage ever matters.

**LC / DNB / BnF — not individually re-verified**; treated as low-drift. Re-check bulk paths when Stage 1 actually ingests them.

## Plan changes this forces

1. **Phase B Stage 1 (Discover redesign / corpus spine):** add the OL `wikidata` dump to the ingest list alongside editions/works/authors. Author reconciliation starts from that join; SPARQL is reserved for the series slice (P179/P1545) and gap queries.
2. **Runtime OL traffic must identify itself.** The 3 req/s identified tier vs 1 req/s anonymous is a 3× budget difference that costs one User-Agent header. Add `User-Agent: Reverie (reveriereads.app; <contact email>)` to every OL call in the enrich/covers functions, and retune sourcePace budgets to the identified tier once shipped. (Current budgets were set below even the anonymous tier — compliant, but leaving 3× on the table.)
3. **Cover posture unchanged and now confirmed:** no OL bulk-cover path exists. Candidate covers stay hotlink-only; ingest stays reserved for owned books.
4. **ISBNdb decision point stays at Phase B**, with two reads required at purchase: redistribution clause, daily limits. The $35.99 Premium tier remains the right entry (bulk endpoint).
5. **Two license verifications become Phase B gate items:** FAST terms before the genre backbone is published; ISBNdb ToS before subscription. Neither blocks Phase A.

## What was NOT re-verified

BNB, LC MDSConnect bulk paths, DNB/BnF dump cadence, FAST's exact license text, ISBNdb's exact ToS language, national libraries flagged in Phase 0's follow-up list. None are Phase A dependencies; all are listed at their Phase B gate above.
