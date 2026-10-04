# @openmasq/redact

## 0.2.0

### Minor Changes

- 3dff6bb: `detectLocalNer` rejects when the model fails, so an empty result only ever means nothing was found. Inside `pseudonymize` the failure is reported as `modelError` and the pass continues on the rules; check it to fail closed. `onError` now observes the failure (logging, metrics) and no longer replaces it with an empty result.

### Patch Changes

- 2aaa4fd: The document, OCR and viewer entries word their errors in English (`error`, the default OCR markers). `errorCode` and `errorParams` are unchanged and stay the stable way to word a failure in another language.
- 1d54e18: A labelled organisation field that also holds an address (« Employer: Acme SAS, 12 rue des Lilas, 69003 Lyon ») is split: the company and the address each get their own fake.
- 65d89b3: README for npm: usage first, real output of the three modes, the categories and how each is detected, the fail-closed pattern (`modelError` + `requiresModel`), the benchmark against Presidio with its limits; French version in README.fr.md. Homepage now points to openmasq.com/redact.
