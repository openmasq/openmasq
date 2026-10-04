# @openmasq/redact — reversible PII redaction for LLM prompts

[![npm](https://img.shields.io/npm/v/@openmasq/redact)](https://www.npmjs.com/package/@openmasq/redact)
[![license](https://img.shields.io/npm/l/@openmasq/redact)](https://github.com/openmasq/openmasq/blob/main/LICENSE)
[![types](https://img.shields.io/npm/types/@openmasq/redact)](https://www.npmjs.com/package/@openmasq/redact)

**[Developer guide](https://help.openmasq.com/en/redact)** · [Website](https://openmasq.com/redact) · [Benchmark](https://github.com/openmasq/openmasq/tree/main/packages/redact/bench/spans) · [Français](https://github.com/openmasq/openmasq/blob/main/packages/redact/README.fr.md)

Detect sensitive data in a prompt, replace it with **realistic fakes** before it reaches the
model, and **restore the real values** in the reply. Offline, TypeScript, no network in the
core. It is the engine behind [OpenMasq](https://openmasq.com), the privacy-first LLM desktop app.

```bash
npm install @openmasq/redact
```

## Quick start

```ts
import { pseudonymize, unredactReply } from "@openmasq/redact";

const vault = {};                                         // one per conversation — keep it, never send it
const { text } = await pseudonymize(
  "Write to Claire Martin (claire.martin@acme.fr) about invoice FR76 3000 6000 0112 3456 7890 189.",
  { vault },
);
// text → "Write to Eulalie Fressineau (eulalie.fressineau@courlys.fr) about invoice FR76 1050 8147 1788 2958 0420 560."

const reply = await callYourLLM(text);                    // "Dear Eulalie Fressineau, …"
const shown = unredactReply(reply, vault);                // "Dear Claire Martin, …"
```

## What the model sees

```text
input        Hi, I'm Jean Dupont. Mail jean.dupont@example.org, phone +33 6 12 34 56 78,
             IBAN FR76 3000 6000 0112 3456 7890 189, server 10.0.12.7

pseudonymize Hi, I'm Basile Delsart. Mail basile.delsart@melvio.com, phone +33 6 50 11 00 45,
             IBAN FR76 1050 8147 1788 2958 0420 560, server 10.161.175.138

mode: token  Hi, I'm [PERSON1]. Mail [EMAIL1], phone [PHONE1], IBAN [IBAN1], server [IP1]

redact       Hi, I'm Jean Dupont. Mail [REDACTED_EMAIL_1], phone [REDACTED_PHONE_1],
             IBAN [REDACTED_IBAN_1], server [REDACTED_IP_1]
```

- **Fakes keep the shape**: a fake IBAN passes mod-97, a fake card passes Luhn, a fake phone
  number is valid, a fake email matches its fake name. The model reasons on plausible data.
- **Tokens** (`mode: "token"`) leak the least, at some cost to answer quality.
- **`redact`** is synchronous and rules-only — no name detection, as the output shows.

## Examples

Each example is shortened from a script run against this version; the outputs shown are real.

### A conversation: one vault, one salt

A value keeps **one** substitute for the whole conversation, so the model can refer back to it.

```ts
import { pseudonymize, unredactReply, type Vault } from "@openmasq/redact";
import { randomInt } from "node:crypto";

const conv = { vault: {} as Vault, salt: randomInt(1, 2 ** 31) }; // store both with the conversation

await pseudonymize("Book a table for Lucas Bernard.", { vault: conv.vault, salt: conv.salt });
// → "Book a table for Aymeric Bouchereau."
await pseudonymize("Also invite Lucas Bernard's sister.", { vault: conv.vault, salt: conv.salt });
// → "Also invite Aymeric Bouchereau's sister."            same fake, next turn

const saved = JSON.stringify(conv);  // persist it ENCRYPTED: the vault holds the real values
```

The `salt` makes the value → fake mapping secret to this conversation; without it the mapping
is a public, deterministic hash.

### Tool calls: real values out, masked results back

```ts
import { pseudonymize, unredactArgs } from "@openmasq/redact";

// The model calls a tool with the fake it saw. Restore the REAL values before executing it:
const args = JSON.parse(unredactArgs(toolCall.arguments, vault));   // { from: "paul.durand@example.com" }
const result = await searchMail(args);

// Mask the tool's answer with the SAME vault before the model reads it:
const { text } = await pseudonymize(result, { vault });
// "3 emails from firmin.guilbaud@orbisel.nl, last one signed by Firmin Guilbaud, +33 6 50 11 00 45"
```

Use `unredactReply` to **display** a reply (it also repairs fakes the model slightly altered),
and `unredactArgs` for **arguments sent to a real tool** (exact, URL-encoded forms included,
never a guess).

### Choosing what to mask

```ts
const r = await pseudonymize(
  "Ticket from Camille Laurent at Acme Corp, see https://help.acme.io. Key: sk-live-4f9a8b7c6d5e4f3a2b1c",
  {
    vault,
    disabledKinds: ["url"],                    // categories left IN CLEAR — everything else is masked
    keep: ["Acme"],                            // values never masked, as detected (see r.matches)
    secrets: ["sk-live-4f9a8b7c6d5e4f3a2b1c"], // exact strings always masked
  },
);
// "Ticket from Sidonie Mabille at Acme Corp, see https://help.acme.io. Key: sk-live-3a3g7g1q5i9u5i5e7s9s"
// r.matches → NAME: Camille Laurent → Sidonie Mabille · API_KEY: sk-live-4f9a… → sk-live-3a3g…
```

- A category added in a future version is masked by default.
- **Plain dates** are the one exception: they are masked only when `disabledKinds` is given
  and does not contain `"date"`. A bare call never masks an ordinary date.
- `keep` matches the value **as detected**: here the engine detects "Acme", so "Acme Corp"
  would not match. Check `r.matches`.

### Scrub logs and error reports

```ts
import { redactText } from "@openmasq/redact";

redactText("POST /login user=marc@example.org token=eyJhbGciOi… from 192.168.1.24");
// "POST /login user=[REDACTED_EMAIL_1] token=[REDACTED_JWT_1] from [REDACTED_IP_1]"
```

### Show the user what was masked

```ts
import { pseudonymize, toSegments, redactionCategory } from "@openmasq/redact";

const { matches } = await pseudonymize(original, { vault });
const kinds = Object.fromEntries(matches.map((m) => [m.value, redactionCategory(m.category ?? m.type)]));
for (const s of toSegments(original, vault, kinds)) render(s); // { kind: "text" | "redaction", value, label }
// Send the contract to [Inès Moreau · name], [ines.moreau@example.fr · email]
```

## Names need a model — fail closed

Names, companies, addresses, places and birth dates (`MODEL_CATEGORIES`) have no shape a rule
can match. Without a model, only their anchored forms are caught: "Camille Laurent" is, "Julie
Petit" is not, and in "Mme Julie Petit" only "Julie" is. Run the on-device NER, and refuse to
send when it fails:

```ts
import { pseudonymize, requiresModel, detectLocalNer } from "@openmasq/redact";
import { createNerPredict } from "@openmasq/redact/ner"; // + @huggingface/transformers, onnxruntime-node

const predict = await createNerPredict();                 // load once, reuse
const res = await pseudonymize(text, { vault, disabledKinds, detectLocal: (t) => detectLocalNer(t, predict) });

// A failed model does not reject the pass: it continues on the rules and reports it.
if (res.modelError) throw new Error(`not sent: ${res.modelError}`);
```

Without any detector, refuse when `requiresModel(disabledKinds)` is true.
`createNerPredict()` downloads `openmasq/ner-multilingual` from Hugging Face, pinned to a
reviewed commit. In production, download it once, check each file against
`NER_WEIGHTS_SHA256`, and load it offline (`modelName` + `allowLocalModels`).
→ [Guide: names and the NER](https://help.openmasq.com/en/redact-ner)

## Documents

```ts
import { extractBytes } from "@openmasq/redact/documents"; // + pdfjs-dist, @napi-rs/canvas; mammoth for DOCX
import { pseudonymize } from "@openmasq/redact";

const file = await extractBytes(bytes, "payslip.pdf", "application/pdf");
if (file.errorCode) throw new Error(file.errorCode);      // extraction never throws: check it
const { text } = await pseudonymize(file.text, { vault });
```

**Scans are not supported yet.** A PDF page that is short (under 120 characters), paints an
image or carries form fields is sent to OCR, which is not published: such a document returns
`errorCode: "ocr_engine_missing"` and no text at all. Error messages are in French for now;
rely on `errorCode`. → [Guide: documents](https://help.openmasq.com/en/redact-documents)

## What it detects

| Category | Examples | Detected by |
|---|---|---|
| `secret`, `apikey` | API keys (OpenAI, Anthropic, AWS, GitHub, Slack…), JWT, private keys, connection strings, cookies | rules |
| `email`, `phone`, `ip`, `url`, `path`, `username` | addresses, numbers validated with libphonenumber, IPv4/6, file paths, `@handles` | rules |
| `card`, `iban`, `national_id`, `company_id` | checksum-validated (Luhn, IBAN mod-97…), SSN / NIR, SIREN / VAT | rules |
| `dob`, `date` | birth dates (labelled), other dates — opt-in | rules + model |
| `name`, `company`, `address`, `location` | people, organisations, postal addresses, cities and places | **model** + rules for anchored forms |

Tuned for French and English first; addresses cover FR/EN/DE/ES/IT/PT/NL and CJK. Well-known
public figures and brands stay readable (`peopleNotoriety: false` masks them too).
→ [Guide: options and categories](https://help.openmasq.com/en/redact-options)

## Benchmark

Character-level F1 on the categories above, one scorer for every engine, replayable offline.
[Method, the stricter "every mention" measure and per-category misses →](https://github.com/openmasq/openmasq/tree/main/packages/redact/bench/spans)

| corpus | cases | rules only | rules + on-device NER | Presidio + spaCy |
|---|---:|---:|---:|---:|
| OpenMasq (FR, synthetic) | 907 | 0.931 | 0.923 | 0.547 |
| TAB | 127 | 0.425 | **0.855** | 0.815 |
| Gretel | 2000 | 0.575 | **0.646** | 0.422 |
| ai4privacy | 2000 | 0.756 | 0.827 | 0.579 |
| Nemotron | 2000 | 0.627 | **0.928** | 0.768 |

**The strong numbers need the NER**; rules alone trail Presidio on TAB and Nemotron. Another
detector, PII-Tracer, scores higher on ai4privacy (0.952). F1 gives partial credit — once
every mention of a value must be found, TAB drops to 49 %.

## Entries and optional peers

| Entry | For | Install |
|---|---|---|
| `@openmasq/redact` | text: detect, mask, restore | — (`libphonenumber-js`, `fflate`) |
| `/ner` | on-device NER | `@huggingface/transformers`, `onnxruntime-node` |
| `/documents`, `/documents.browser` | text from PDF, DOCX, XLSX | `pdfjs-dist`, `@napi-rs/canvas` (Node), `mammoth`, `xlsx` ≥ 0.20.3 from the official [SheetJS CDN](https://cdn.sheetjs.com) |
| `/inplace` | mask a DOCX/XLSX keeping its format | `xlsx` (as above) |
| `/pdf-redact`, `/image-redact` | paint masks over a PDF or an image | `pdfjs-dist`, `@napi-rs/canvas` (Node) |

## FAQ

**Does anything leave the machine?** No: the core makes no network call. Only the opt-in
`/remote` entry and the first NER model download touch the network.

**Where do I store the vault?** With the conversation, encrypted at rest. It maps every fake
to the real value: treat it like the original data.

**Will the output change between versions?** Yes — detection improves. `0.x`: a minor may
also change the API. Pin an exact version if you need a stable output.

More recipes and details: **[the developer guide](https://help.openmasq.com/en/redact)**.

## Contributing

The engine lives in the [OpenMasq monorepo](https://github.com/openmasq/openmasq), where the
app consumes it from source. `src/engine/` holds the rules, fakes and vault; `src/model/` the
candidate pipeline; `src/__cases__/` the regression corpus; `bench/` the public benchmarks.
`pnpm test:redact` is the fast lane: the suite is the specification.

Apache-2.0 © OpenMasq
