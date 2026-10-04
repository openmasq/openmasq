---
"@openmasq/redact": minor
---

`detectLocalNer` rejects when the model fails, so an empty result only ever means nothing was found. Inside `pseudonymize` the failure is reported as `modelError` and the pass continues on the rules; check it to fail closed. `onError` now observes the failure (logging, metrics) and no longer replaces it with an empty result.
