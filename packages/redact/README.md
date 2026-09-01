# @openmasq/redact — the redaction engine

Sensitive data is replaced **before it leaves the machine** by a placeholder or a
believable fake, and restored in the reply from the same **per-conversation vault**.
This package is that engine: `redact` / `pseudonymize` / `unredact` / `toSegments`, the
category model, the document extractors and the on-device NER.

**Boundary.** Pure TypeScript, no Electron, no React, no network — except the `remote/`
entry (an optional remote engine the caller opts into) and `local/ner.ts` (ONNX on
device). Every subpath in `package.json` `exports` has a matching `tsup.config.ts` entry:
move one, move both.

**Start here.**
- `src/index.ts` — the barrel; `src/engine/` — the pipeline (rules, fakes, formulas).
- `src/model/` — categories, validators, vocabularies (French-language term lists — the
  product's first market — under English module names).
- `src/documents/` — PDF/OOXML/image extraction; `src/viewer/` — in-place redaction.
- `src/__cases__/` — the regression corpus, one file per document family; `bench/` — recall
  benches run by `pnpm test:corpus`, never by `pnpm test`.

`pnpm test:redact` is the fast lane for engine work (~4 s). The suite is the specification:
a rule without a case is not finished.
