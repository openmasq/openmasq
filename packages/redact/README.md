# @openmasq/redact — reversible PII redaction for LLM prompts

[![npm](https://img.shields.io/npm/v/@openmasq/redact)](https://www.npmjs.com/package/@openmasq/redact)
[![license](https://img.shields.io/npm/l/@openmasq/redact)](https://github.com/openmasq/openmasq/blob/main/LICENSE)
[![types](https://img.shields.io/npm/types/@openmasq/redact)](https://www.npmjs.com/package/@openmasq/redact)

<sub>**English** · [Français](https://github.com/openmasq/openmasq/blob/main/packages/redact/README.fr.md) · [openmasq.com/redact](https://openmasq.com/redact)</sub>

Detect sensitive data in a prompt, replace it with **realistic fakes** before it reaches the
model, and **restore the real values** in the reply. Offline, TypeScript, no network in the
core. It is the engine behind [OpenMasq](https://openmasq.com), the privacy-first LLM desktop app.

```bash
npm install @openmasq/redact
```

```ts
import { pseudonymize, unredact } from "@openmasq/redact";

const vault = {};                                         // yours: keep it, never send it
const { text } = await pseudonymize(prompt, { vault });  // what the model sees
const reply = await callYourLLM(text);
const restored = unredact(reply, vault);                  // what the user sees
```

## What the model sees

One input, three modes (real output of `0.1.0`):

```text
input        Hi, I'm Jean Dupont. Mail jean.dupont@example.org, phone +33 6 12 34 56 78,
             IBAN FR76 3000 6000 0112 3456 7890 189, server 10.0.12.7

pseudonymize Hi, I'm Basile Delsart. Mail basile.delsart@melvio.com, phone +33 6 50 11 00 45,
             IBAN FR76 1050 8147 1788 2958 0420 560, server 10.161.175.138

mode: token  Hi, I'm [PERSON1]. Mail [EMAIL1], phone [PHONE1], IBAN [IBAN1], server [IP1]

redact       Hi, I'm Jean Dupont. Mail [REDACTED_EMAIL_1], phone [REDACTED_PHONE_1],
             IBAN [REDACTED_IBAN_1], server [REDACTED_IP_1]
```

- **Fakes keep the shape**: a fake IBAN passes the checksum, a fake phone number is valid, a
  fake name keeps its gender. The model reasons on plausible data, so its answer stays useful.
- **Tokens** (`mode: "token"`) leak the least — a fake postal code still names a region — at
  some cost to answer quality.
- **`redact`** is the synchronous, rules-only pass. `pseudonymize` adds name and context
  detection, and the optional on-device NER.

## The vault

A `Vault` is a plain JSON object: substitute → real value. Pass the same one on every turn
of a conversation and a value keeps **one** substitute throughout, so the model can refer
back to it and `unredact` restores it everywhere — in prose, in JSON tool arguments
(`unredactArgs`), across reformatted dates.

**The vault is the sensitive data.** The engine never stores or sends it: keep it in memory,
encrypt it at rest, never put it in a prompt or a log.

## What it detects

| Category | Examples | Detected by |
|---|---|---|
| `secret`, `apikey` | provider API keys (OpenAI, Anthropic, AWS, GitHub, Slack…), JWT, private keys, connection strings, cookies | rules |
| `email`, `phone`, `ip`, `url`, `path`, `username` | addresses, numbers validated with libphonenumber, IPv4/6, file paths, `@handles` | rules |
| `card`, `iban`, `national_id`, `company_id` | checksum-validated (Luhn, IBAN mod-97…), SSN / NIR, SIREN / VAT | rules |
| `dob`, `date` | birth dates (labelled), other dates — **opt-in** (see below) | rules + model |
| `name`, `company`, `address`, `location` | people, organisations, postal addresses, cities and places | **model** + rules for anchored forms |

The lists are tuned for French and English first; addresses cover FR/EN/DE/ES/IT/PT/NL and CJK.
Well-known public figures and brands stay readable (opt out with `peopleNotoriety: false`).

## Choosing what to mask

`disabledKinds` lists the categories to **leave in clear**; everything else is masked, so a
category added in a future version is masked by default.

```ts
await pseudonymize(text, { vault, disabledKinds: ["url", "path"] });
```

Plain dates are the one exception: they are masked only when `disabledKinds` is given and
does not contain `"date"` — a bare call never masks an ordinary date. Other options: `keep`
(exact values never masked), `forced` (a value masked as a category), `secrets` (exact
strings always masked), `numbers` (also tokenise bare numbers).

## Fail closed: names need a model

Names, companies, addresses, places and birth dates (`MODEL_CATEGORIES`) have no shape a
rule can match reliably; the rules only catch their anchored forms. When one of them is on,
run a model detector — or refuse the pass instead of sending a half-masked text:

```ts
import { pseudonymize, requiresModel, detectLocalNer } from "@openmasq/redact";
import { createNerPredict } from "@openmasq/redact/ner"; // + @huggingface/transformers, onnxruntime-node

const predict = await createNerPredict();                 // load once, reuse
const detectLocal = (t: string) =>
  detectLocalNer(t, predict, { onError: (err) => { throw err; } }); // surface a failed inference

const res = await pseudonymize(text, { vault, disabledKinds, detectLocal });
// A detector that fails does NOT reject: the pass continues on the rules and says so.
if (res.modelError && requiresModel(disabledKinds)) throw new Error(`not sent: ${res.modelError}`);
```

Without a detector at all, check `requiresModel(disabledKinds)` before the pass and refuse
when it is true.

`createNerPredict()` loads `openmasq/ner-multilingual` from Hugging Face, pinned to a reviewed
commit (`NER_REVISIONS`). For production, download it once, check each file against
`NER_WEIGHTS_SHA256`, and load it offline (`modelName` + `allowLocalModels`).

## Benchmark

Character-level F1 on the categories above, one scorer for every engine, replayable offline.
[Full method, the stricter "every mention" measure and per-category misses →](https://github.com/openmasq/openmasq/tree/main/packages/redact/bench/spans)

| corpus | cases | rules only | rules + on-device NER | Presidio + spaCy |
|---|---:|---:|---:|---:|
| OpenMasq (FR, synthetic) | 907 | 0.931 | 0.923 | 0.547 |
| TAB | 127 | 0.425 | **0.855** | 0.815 |
| Gretel | 2000 | 0.575 | **0.646** | 0.422 |
| ai4privacy | 2000 | 0.756 | 0.827 | 0.579 |
| Nemotron | 2000 | 0.627 | **0.928** | 0.768 |

Read it honestly: **the strong numbers need the NER**; rules alone trail Presidio on TAB and
Nemotron. Another detector, PII-Tracer, scores higher on ai4privacy (0.952). F1 gives partial
credit — once every mention of a value must be found, TAB drops to 49 %.

## Entries and optional peers

The core entry only depends on `libphonenumber-js` and `fflate`. The others need optional
peers you install yourself:

| Entry | For | Install |
|---|---|---|
| `@openmasq/redact` | text: detect, mask, restore | — |
| `/ner` | on-device NER | `@huggingface/transformers`, `onnxruntime-node` |
| `/documents`, `/documents.browser` | text from PDF, DOCX, XLSX | `pdfjs-dist`, `mammoth`, `@napi-rs/canvas` (Node), `xlsx` ≥ 0.20.3 from the official [SheetJS CDN](https://cdn.sheetjs.com) |
| `/inplace` | mask a DOCX/XLSX keeping its format | `xlsx` (as above) |
| `/pdf-redact`, `/image-redact` | paint masks over a PDF or a scan | `pdfjs-dist`, `@napi-rs/canvas` (Node) |

OCR of scans is not published yet: a document that needs it fails with a `DocumentError` of
code `ocr_engine_missing`; text layers still extract.

## Versioning

`0.x`: a minor may change the API. Detection improves between versions — the same input can
be masked differently after an update. Pin an exact version if you need a stable output.

## Contributing

The engine lives in the [OpenMasq monorepo](https://github.com/openmasq/openmasq) — the app
consumes this package from source. `src/engine/` holds the rules, fakes and the vault;
`src/model/` the candidate pipeline and vocabularies; `src/__cases__/` the regression corpus;
`bench/` the public benchmarks. `pnpm test:redact` is the fast lane: the suite is the
specification, and a rule without a case is not finished.

Apache-2.0 © OpenMasq
