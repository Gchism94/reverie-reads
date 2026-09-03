# Series-data evaluation request

Reverie is evaluating commercial bibliographic data for work-to-series relationships. We would
like a non-production evaluation extract for the supplied 200-work test set.

Please return, where available:

- provider work ID and all ISBN-10, ISBN-13, ASIN, OCLC, or other edition identifiers;
- canonical series ID and name, aliases, and creator discriminator;
- every work-to-series membership, including subseries, spinoff, universe, companion, novella,
  omnibus, and publisher-collection distinctions;
- the provider's membership role or grouping;
- publication, narrative/chronological, recommended, and display orders as separate values;
- announced or unbound series slots, series status, and explicitly declared length;
- record update date and a stable source reference for every returned claim.

The commercial response should also answer:

1. May Reverie store normalized facts permanently and display them in a paid consumer application?
2. May Reverie retain normalized or derived corpus facts after contract termination?
3. May users correct the supplied facts while Reverie retains source-level provenance?
4. Are raw records, normalized records, or aggregate evaluation results publishable?
5. What are the full-feed and delta-feed cadence, delivery method, rate limits, and SLA?
6. How are independently published, Kindle-first, ASIN-only, forthcoming, and cancelled works
   covered?
7. What are the setup fee, recurring fee, usage fee, and overage model?

The evaluation will measure exact-work precision, membership precision and recall, false series
assignments to standalone works, order accuracy by order type, missing-slot discovery, recent-title
latency, alias handling, review time, and effective cost per accepted claim.
