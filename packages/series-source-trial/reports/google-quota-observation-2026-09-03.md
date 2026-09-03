# Google Books quota observation — 2026-09-03

The 80-case harness run received `429 rateLimitExceeded` for every request. A single follow-up
request confirmed that the Google Books API project's daily query quota had been exhausted. The
adapter preserved these as errors; it did not reinterpret them as missing work or series data.

Earlier the same day, before this harness was created and before the daily quota was exhausted, a
69-case exploratory run matched 66 work identities and returned zero named, structured series
memberships. That exploratory result is directional only because it used the Reverie-series subset
rather than this harness's 80-case set.

Google Books remains useful as an identity/search comparison, but this observation is also a
resilience result: a daily project quota can make the provider completely unavailable. Its
persistent-storage restriction independently prevents it from passing the corpus-source gate.
