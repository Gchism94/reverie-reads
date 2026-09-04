# Series-source trial score

Cases: 80 total; 23 authority-reviewed; 57 candidate references.

| Provider | Work match | Relational series | Precision | Recall | False standalone | Order accuracy | Procurement gate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| openlibrary | 87.5% | 8.8% | 100.0% | 58.3% | 0.0% | 100.0% | not yet |
| wikidata | 32.5% | 10.0% | 100.0% | 66.7% | 0.0% | 75.0% | not yet |

Precision, recall, standalone safety, and order accuracy use authority-reviewed cases only.
Reference agreement includes candidate Reverie labels and is diagnostic, not an accuracy claim.
A provider cannot pass until the policy sample-size, rights, persistence, provenance, and accuracy gates all pass.

## openlibrary

Failed gates: commercialUsePermitted, persistentStoragePermitted, minimumReviewedCases, minimumReviewedPositiveCases.
Errors: 0; latency p50/p95: 409/995 ms.

## wikidata

Failed gates: minimumReviewedCases, minimumReviewedPositiveCases.
Errors: 0; latency p50/p95: 54/169 ms.
