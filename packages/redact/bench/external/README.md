# External comparison — Presidio's own evaluation corpus

The away game. The internal benches (`../corpora/`) measure regressions on our corpus;
this directory scores the engine on **[Microsoft Presidio](https://github.com/data-privacy-stack/presidio-research)'s
own synthetic evaluation dataset**, and scores Presidio on the same cases through the
**same metric** (`../metric.ts`). Home-field advantage removed in both directions: the
historical internal report ran Presidio on our corpus; this runs us on theirs.

## Result — 2026-08-31

1 325 cases, 2 642 annotated truths (English). Same scorer for all three columns:
≥ 60 % significant-token coverage per truth, false positives by overlap.

| category | truths | openmasq `patterns` | **openmasq `ner` (the product)** | Presidio default |
|---|---:|---:|---:|---:|
| NAME | 857 | 32 % | **98 %** | 87 % |
| ADDRESS | 598 | 26 % | **38 %** | 17 % |
| CITY | 411 | 2 % | **68 %** | 58 % |
| ORG | 250 | 5 % | **73 %** | 22 % |
| CARD | 136 | **100 %** | **100 %** | 97 % |
| DATE | 119 | 14 % | 14 % | **100 %** |
| PHONE | 92 | 57 % | 57 % | **63 %** |
| EMAIL | 49 | 100 % | 100 % | 100 % |
| POSTAL | 37 | 0 % | 0 % | **5 %** |
| URL | 37 | 100 % | 100 % | 100 % |
| ID | 21 | 95 % | 95 % | **100 %** |
| IBAN | 21 | 100 % | 100 % | 100 % |
| IP | 14 | 100 % | 100 % | 100 % |
| **GLOBAL** | 2 642 | 30 % · **6 FP** | **71 %** · 123 FP | 60 % · 196 FP |

## Honest reading

- **`patterns` vs Presidio is not a product comparison** — it pits a no-model pipeline
  against a spaCy-NER engine. The product column is `ner`.
- **DATE 100 vs 14 is a design choice, not a defect**: the engine only redacts a date in
  a *birth* context — a blanket date rule would destroy every timestamp a chat carries.
  This corpus annotates every date as truth; all 17 birth-context dates are caught, the
  102 generic ones are left in clear on purpose. Excluding DATE (as TITLE/AGE/NRP
  already are, on both sides) the global gap reads 74 % vs 58 %.
- **POSTAL / PHONE favor Presidio structurally**: US ZIP and NANP formats, outside this
  engine's FR/EU center of gravity.
- **Precision has a hierarchy**: 6 FP (patterns) · 123 (ner) · 196 (Presidio). Every
  detection layer is paid for in false positives; the local NER pays less than
  Presidio's for a higher recall.
- **Synthetic-vs-synthetic caveat**: faker-built corpora are structurally friendly to
  pattern engines — treat absolute numbers as comparable *between columns*, not as
  field performance. The internal corpora (real document layouts, OCR damage,
  14 languages) are the harder test; there the same ordering holds
  (`ner` 93.5 % vs Presidio 64.3 %, same metric — see the engine history).

## Replay it

```bash
pnpm exec tsx packages/redact/bench/external/run.mts                                    # patterns
pnpm build && pnpm exec tsx packages/redact/bench/external/run.mts --ner                # the product
pnpm exec tsx packages/redact/bench/external/run.mts --detections presidio.detections.json
```

To regenerate the Presidio column from scratch (Python):
`python -m venv v && v/bin/pip install presidio-analyzer && v/bin/python -m spacy download en_core_web_lg`
then `v/bin/python run_presidio.py` from this directory.

## Provenance & pinning — what makes this citable

- **Dataset**: `synth_dataset_v2.json` from
  [data-privacy-stack/presidio-research](https://github.com/data-privacy-stack/presidio-research)
  (MIT © Microsoft Corporation), pinned at commit `78c45e58` with a sha256-verified
  fetch (`fetch.sh`). Fully synthetic (template + faker generated) — no real persons.
- **Adaptation**: `adapt-presidio-research.mjs` — InputSample → BenchCase, mapping
  documented in the file. Excluded on both sides: TITLE, AGE, NRP (out of the product's
  scope; the recall denominators drop them for every engine equally). The committed
  `presidio-research.benchcase.json` is the reference input.
- **Presidio column**: `presidio.detections.json`, produced by `run_presidio.py` with
  presidio-analyzer **2.2.364**, spaCy **3.8.16**, `en_core_web_lg` **3.8.0**, default
  `AnalyzerEngine` (score threshold 0, 17 predefined recognizers). This is Presidio's
  default configuration, not its ceiling — it is a library built to receive custom
  recognizers.
- **openmasq columns**: computed live from `../../src` at whatever commit you're on —
  which is the point: the committed Presidio detections are the fixed yardstick, the
  engine columns move with the engine.
