# Real end-to-end tests (logged-in ChatGPT / Claude)

> Two other suites live here on the SAME built-app harness: `workflows-openrouter.e2e.ts`
> (agentic workflows, MCP fixtures) and `documents.e2e.ts` (generation + EDITING of
> ```document documents — PII typed into the editor enters the vault and never leaves in the
> clear). Both are gated on `OPENROUTER_API_KEY` (a free model by default → zero cost);
> `pnpm e2e:workflows` / `pnpm e2e:documents`. Each spec documents its invariants at the top.
> ⚠️ The scripts go through `node ../../node_modules/@playwright/test/cli.js` — the hoisted
> `.bin/playwright` is a standalone `playwright` of ANOTHER version that collects no test at
> all ("did not expect test.describe()").

These launch the **built Electron app** with an **actual signed-in web session**
and assert the core privacy guarantee by comparing two things:

| Prompt contains       | App shows you (your copy) | Text sent to the model        |
| --------------------- | ------------------------- | ----------------------------- |
| nothing sensitive     | the prompt                | **identical**                 |
| names / emails        | the **real** values       | **fake** substitute / token   |
| numbers (number mode) | the **real** figures      | `n1`, `n2`… tokens            |

### What we compare, and why not the live page

The "text sent to the model" is captured at the **relay boundary** — the exact
payload the app hands to the web session (`wv.send("host:send", { text })`),
before it hits the network. We do **not** scrape ChatGPT's rendered page:
driving the live site in automation gets stuck on Cloudflare's "Un instant…"
challenge (bot detection on the embedded webview). Capturing what *leaves the
app* is both Cloudflare-proof and the thing that actually matters — it's exactly
what the model receives. The test still runs the whole pipeline (UI → store →
redaction → relay).

## Why we don't automate the password login

`chatgpt.com` is behind Arkose FunCaptcha + Cloudflare, and **fresh logins from
inside Electron loop forever** on Cloudflare's challenge (it flags the embedded
browser as a bot → repeated 403). OpenAI's ToS also forbids automated login.

So we **don't** log in from scratch. `pnpm e2e:login`:

1. Launches the app on your **real profile** and, if it's already signed in to
   ChatGPT/Claude (it usually is — you use the keyless feature), **copies just the
   session cookies** (`Partitions/`) into the isolated test profile. No password,
   no CAPTCHA, no Cloudflare.
2. Only if no existing session is found does it fall back to an interactive login
   window (now using a Chromium-matching User-Agent, so it no longer loops).

## Usage

```bash
# 1) Once: adopt your existing session into the test profile (or log in by hand).
pnpm e2e:login                       # ChatGPT
E2E_PLATFORM=claude pnpm e2e:login   # or Claude

# 2) Automated comparison tests — reuse the saved session, no password needed.
pnpm test:e2e
```

The session lasts weeks; re-run `e2e:login` only when `test:e2e` reports "Not
signed in". These tests hit the real network and a real model, so they are
**not** part of `pnpm test` — run them nightly or manually.

> The infinite-Cloudflare-loop on a Firefox UA was also a **real bug** in the
> app's own keyless login (`webSession.ts` forced a Firefox UA on the Chromium
> login window); it's fixed to use a Chrome UA for the platform's own sign-in.

## How it works

- Two inert production hooks (no effect without the env vars):
  `OPENMASQ_USER_DATA_DIR` points Electron at the test profile;
  `OPENMASQ_DISABLE_DB` skips the local DB so the renderer store is
  localStorage-only and tests can seed settings deterministically.
- `helpers.ts` launches the app, opens a keyless chat, patches the webview's
  `send` to record the relayed `text`, sends a prompt, and reads the app's user
  bubble (`.msg.user`) + redaction highlights (`mark.redaction-mark`).
- `chat.e2e.ts` runs the no-sensitive / email / numbers comparisons above.

Settings are seeded per-test through `localStorage`. Email and number cases work
fully offline via the built-in regex rules; **names/companies** detection needs a
reachable redaction model (Mistral/Ollama).

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
