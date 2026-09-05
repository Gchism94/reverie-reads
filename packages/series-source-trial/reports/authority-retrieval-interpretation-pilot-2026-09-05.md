# Authority retrieval interpretation pilot — 2026-09-05

## Outcome

The retrieval gateway is now connected to the authority-acquisition harness behind the explicit
`--retrieval` flag. The connection remains no-write and review-only. It does not activate a real
origin, change production behavior, or relax the source rules that quarantine unsupported
Hardcover and scout proposals.

The result is a usable experiment harness, not a successful navigation-recall trial yet. The first
real candidate, Pip Landers-Letts's author site, correctly remains unresolved.

## Implemented boundary

- Retrieval is attempted only when the first scout proposal is unresolved or fails deterministic
  source policy.
- A parent is selected only from the same response's consulted-source manifest and a current
  `approved_trial` origin profile.
- The second model request has no tools, receives one hash-verified child packet, and can cite only
  that child URL. The reviewed profile—not the model—owns source kind.
- The model call is skipped unless the packet contains the normalized exact title and a target
  author identity.
- Post-validation requires packet support for every proposed series name, standalone statement,
  and position before the result can replace the first proposal. Unsupported position becomes null
  and unsupported membership role becomes unknown without discarding a direct relationship.
- The returned result and cache omit page text. The second response is cached by target, model,
  prompt version, profile/policy/extractor versions, child URL, source kind, and sanitized-packet
  hash.
- A failure or unsafe second proposal leaves the original scout proposal intact for review.

## Pyg source probe

The live probe used the gateway's exact named user agent on 2026-09-05. The site returned a 200
`text/plain` robots file with `User-agent: *`, `Allow: /`, and only a lightbox-query disallow. The
non-`www` origin redirected canonically to `www`.

That technical signal does not establish reuse rights. No linked site-specific terms or privacy
page was found, no human reviewer has approved the origin, and the committed profile therefore
stays `pending`.

The content also fails the current technical and evidence gates:

| Page | Encoded bytes | 512 KiB limit | Safe extracted evidence |
| --- | ---: | --- | --- |
| `/` | 903,233 | Exceeds | Not fetched by the gateway |
| `/series` | 627,478 | Exceeds | Names The Leamington Bloom Series but does not directly place _Pyg_ in it |

The static page includes a `PYG, GOODREADS` control label and an outbound store URL. Neither is a
direct exact-work series relationship. Raising the byte ceiling or treating those UI attributes as
membership evidence would optimize for the answer already known from the gold review, so this
pilot does neither.

## False-positive and cost checks

Replaying the earlier Pyg scout false positive through the current canonicalizer removes
`series_membership` from both spin-off summaries. The membership then has no evidence URL and fails
validation instead of becoming a usable proposal.

The real CLI dry run used the cached Pyg scout response with `--retrieval`. It returned the current
unresolved first pass plus `origin_pending`: zero HTTP retrieval requests, zero retrieved bytes,
and zero second model calls.

One synthetic live interpreter check supplied direct author, exact-work, series, and position text
plus an adversarial instruction inside the inert packet. `gpt-5.6-luna` returned the supported
series and book-one proposal, used 787 input and 160 output tokens, completed in 3.2 seconds, and
passed all deterministic checks. This validates the request and interpretation path; it is not a
measurement of live-source recall.

## Decision and next gate

Keep the 512 KiB limit, safe static extractor, and Pyg profile status unchanged. The next meaningful
trial needs a human-approved first-party origin whose parent and child pages fit the current
contract and contain direct title-author relationship text. Only then can the paired
navigation-needed sample measure whether retrieval reduces unresolved cases by the ADR's required
25% without reducing membership precision or standalone safety.

Production, Supabase, the corpus, authority gold, and user matching remain untouched.
