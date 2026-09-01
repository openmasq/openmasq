# Real end-to-end tests (the BUILT app, real provider APIs)

These launch the **built Electron app** on an isolated profile and assert the privacy
contract on the payload that actually leaves the machine. They hit a real network and a
real model, so they are **not** part of `pnpm test` — run them deliberately.

⚠️ The scripts go through `node ../../node_modules/@playwright/test/cli.js` — the hoisted
`.bin/playwright` is a standalone `playwright` of ANOTHER version that collects no test at
all ("did not expect test.describe()").

## What is compared, and where it is captured

The wire is captured in the MAIN process, at the exact boundary `streamChat()` POSTs from
(`src/main/ipc/e2eWireLog.ts`, armed by `OPENMASQ_E2E_WIRE_LOG` and inert without it). Not
the rendered page, not an intermediate state: what the provider receives.

| The prompt carries   | The app shows you    | What leaves for the provider |
| -------------------- | -------------------- | ---------------------------- |
| nothing sensitive    | the prompt           | **identical**                |
| names / e-mails      | the **real** values  | a **fake** or a placeholder  |
| numbers (number mode)| the **real** figures | `n1`, `n2`… tokens           |

## Running one

Each spec **skips itself** when its provider key is absent (`test.skip` at the top of the
file, keys read from the root `.env`) — there is no shared env gate, and nothing to log in to.

```bash
pnpm --filter @openmasq/desktop e2e:boot        # the app starts, nothing else
pnpm --filter @openmasq/desktop e2e:openai      # OPENAI_API_KEY — document round-trip
pnpm --filter @openmasq/desktop e2e:workflows   # OPENROUTER_API_KEY — agentic workflows
pnpm --filter @openmasq/desktop e2e:documents   # OPENROUTER_API_KEY — generate + edit
pnpm --filter @openmasq/desktop e2e:documents-multi  # no key at all (see below)
```

The full list of entry points is `apps/desktop/package.json` (`e2e:*`). ⚠️ The root
`pnpm test:e2e` and `pnpm e2e:login` point at desktop scripts that no longer exist — the
keyless web-session path they served was removed from the product.

## The document round-trip (`e2e:openai`)

`openai-redaction.e2e.ts` attaches a CSV full of personal data, asks for a consolidated CSV
back, and asserts the whole contract: the payload that leaves for `api.openai.com` carries
only placeholders, and the returned document is de-redacted in the copy the user sees — the
real e-mails restored, no token left behind. It runs on the deterministic `patterns` engine
so "nothing leaked" never depends on a model's recall.

## How it works

- Two inert production hooks (no effect without the env vars): `OPENMASQ_USER_DATA_DIR`
  points Electron at the test profile, `OPENMASQ_DISABLE_DB` skips the local DB so the
  renderer store is localStorage-only and a test can seed settings deterministically.
- `helpers.ts` exports `launchApp` (isolated profile, DB disabled), `PROFILE_DIR` and
  `userDataPath`, and re-exports the gestures from `pageActions.ts`. Settings are seeded
  per test through `localStorage`.
- The e-mail and number cases work fully offline through the deterministic rules;
  **names and companies** need a reachable redaction model.

> `e2e/journey/` is NOT a test suite — it is the driver a human or an agent steers by hand.
> Its own `CLAUDE.md` documents it.

## Multiple documents — local redaction, JUDGED (`pnpm e2e:documents-multi`)

`documents-multi.e2e.ts` attaches **four formats in a single send** (CSV, XLSX, PDF, DOCX —
four distinct extractors) and judges the redaction **with no chat model at all**: everything
that produces the result is already on the machine (mBERT for names, docTR/Tesseract for
pixels, the deterministic rules for the rest). No API key, no outgoing call, zero cost — the
recipient is a dummy OpenAI-compatible endpoint raised on 127.0.0.1, which makes it possible
to judge the **real wire** rather than an intermediate state.

- The oracle is the **app's own decision function** (`pseudonymize` on the extracted text),
  not a list rewritten alongside: so this test does NOT measure the detector's recall (that
  is the engine's unit tests' job), it checks that this decision **arrives intact** on the
  wire, across four extractors and the multi-document folding. A divergence here is a
  PIPELINE defect.
- Judging is done **per document section**: the engine mints believable fakes, so a fake
  minted for the NDA can equal a REAL value from the CSV — searched across the whole wire the
  string is ambiguous, searched inside the section it came from it is not.
- Prerequisite: `pnpm bake:ner` (outside a packaged app the weights are read from
  `apps/desktop/build/ner-models`); without them the spec **skips** instead of passing empty.

⚠️ **This spec is RED today, and that is its job**: it reports a real divergence —
`billing@example.com` (the sender header of `invoice-2024-0042.pdf`) is replaced by
`pseudonymize` on the extracted text, but reaches the wire in the clear, while everything
else in the same section (IBAN, card, VAT, names, other e-mails) is correctly redacted. Two
leads to investigate: the text the app extracts differs from what the extractor obtains in
Node, or the drop's replacement map is reused as-is and what it missed leaves in the clear
(the documented `reusableDocReplacements` trap).

## Agentic workflows — real OpenRouter (`pnpm e2e:workflows`)

`workflows-openrouter.e2e.ts` replays the **17 most likely user requests** — the catalogue is
`workflows/catalog.ts`, one prompt per case, each commented with what it checks rather than
what it narrates. Three families: reads (mailbox, search, calendar, day, meeting, Drive, CRM,
payments, sprint), writes (send, event, draft, CRM note, task) and **tool-free prompts**
(write a follow-up, file a pasted contact) — the last of which check that a model does NOT go
rummaging through the connectors when it is only asked to write, and that PII **typed by the
user** does not leave the machine in the clear. All of it against the **real OpenRouter API**
(the `OPENROUTER_API_KEY` key in the root `.env`; a **free** model by default → zero cost).

- `E2E_MODEL` — the model id (default `google/gemma-4-26b-a4b-it:free`).
  ⚠️ The OpenRouter Gemmas are `noTools`: the default checks the **fallback without
  connectors** (the reality on that model). To exercise tool calls:
  `E2E_MODEL="openai/gpt-oss-20b:free"`.
- `E2E_TOOL_FIXTURES=0` — the mode **without** fixtures (no connector — the reality of an
  account that has connected nothing). By default, FIXTURE connectors
  (`fixtures/mcp/workflows.json`, main hook `OPENMASQ_E2E_MCP_FIXTURES`) serve stable results
  stuffed with test PII.
- `E2E_PARALLEL=1` (+ `E2E_WORKERS=n`) — one isolated app/profile per test, in parallel.
  `E2E_STRICT=1` — soft assertions on the CONTENT of the replies.

Always checked, whatever the mode: no PII (fixture or typed) on the wire
(`OPENMASQ_E2E_WIRE_LOG` covers the tool turns too); a write reaches the connector only after
a confirmation click; and the outgoing argument arrives **in the clear** at the connector
(`OPENMASQ_E2E_TOOLCALL_LOG`).

⚠️ **The confirmation SURFACE is itself an assertion.** The catalogue's `write` field is
`"system"` (the non-spoofable main window — send, event) or `"chat"` (a card in the
conversation — draft, note, task: local and reversible), and the harness counts both
separately. The assertion is **deliberately asymmetric**: a risky write MUST have been
confirmed on the main window (otherwise a renderer XSS could click it), whereas a local
gesture that would open a system window is merely a nuisance — soft. The classification comes
from `@openmasq/catalog/mcp` `writeRisk`; this test is what stops a send from sliding onto
the clickable surface.
