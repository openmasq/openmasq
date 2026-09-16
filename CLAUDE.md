# openmasq / redact — agent guide

Privacy-first multi-model desktop chat. Sensitive data is **redacted before it leaves the machine**
(the model only ever sees fakes); the reply is **un-redacted** with the same per-conversation vault.

```
prompt ──redact──▶ what the model receives ──model──▶ reply ──de-redact──▶ shown
```

Models are reached with real **API keys**, or, when a build opens the `OPENMASQ_BILLING` gate, on
the app's key through a hosted API the app is the CLIENT of (metered on credits). That server side
lives in another repository: **nothing about its internals belongs here** (see Conventions).
**Brand VALUES have ONE home** (rule 9): `packages/branding/branding.json` via `@openmasq/branding`
(`BRAND`, `brandHost`…) — runtime/wire/disk values derive from it, never a literal. The NAME is also
the technical namespace (npm scope, `OPENMASQ_*`, `window.openmasq`); `check:brand` guards the RETIRED codename.

> This file is the **map**, loaded into every session — keep it that way. Detail lives in each
> workspace's own `CLAUDE.md`, loaded on demand in that folder (≤ 110 lines, `pnpm check:docs`). See **Writing docs**.

---

## ⛔ Hard rules (always)

1. **Never let a file exceed 300 LOC.** Split before you cross it (`.ts/.tsx/.css`).
   **Enforced**: `pnpm check:loc` (CI) — a NEW over-cap file fails, and a file frozen in
   `scripts/checks/file-size-allowlist.json` fails if it GROWS. The allowlist is a backlog:
   touching a listed file means splitting it. Deliberate growth: `--update --allow-growth` + the
   reason in the commit. New files must be `git add -N`'d to be seen by the gate.
2. **Split into folders cleverly.** A feature folder with an `index.ts` barrel, grouped by domain,
   never by file-type; a component with sub-parts becomes `Thing/` (`Thing.tsx`, `parts/`, `useThing.ts`).
   ~15+ siblings is a flat-dump smell. **One concept = ONE home.** Shallow, thematic, barreled.
3. **Reskins/refactors preserve behavior.** The UI is a thin shell over real logic (vault, store,
   IPC). Change the visual layer only, unless that IS the task.
4. **e2e is slow and costs real money — never run it casually.** `apps/desktop/e2e` drives the built
   app against the **real OpenAI API** (a spec skips itself without its key). Unit tests are free: run them scoped.
5. **Document as you change, in the RIGHT file.** Every app/package has a `CLAUDE.md`; a change to
   its structure, exports, build steps or conventions updates it **in the same change**. **Enforced**:
   `pnpm check:docs` — named paths exist, root ≤ 200 lines, nested ≤ 110. Nested docs are gitignored:
   CI sees only this map; the local gate and the pre-commit hook see them all.
6. **Never write inline CSS — always Tailwind.** No `style={{…}}`: utilities (`bg-brand`, `text-strong`)
   or a semantic class in `packages/ui/src/styles.css` mapped to tokens. Inline `style` ONLY for a runtime-computed value.
7. **⚠️ SECURITY IS NON-NEGOTIABLE — re-verify the trust AND process boundary after every
   implementation.** Real PII, provider keys, a de-redacted sandbox, an agent-driven browser, MCP
   tools on the user's accounts. A change touching **IPC handlers, `spawn`/`exec`/`utilityProcess`,
   network egress, the redaction pipeline/vault, secrets-at-rest, MCP tool gates, the Python sandbox,
   the agent browser, auth/RBAC, metering** is NOT done until ALL of these hold, stated in the change:
   - **Fail CLOSED.** On error/timeout/unknown, the SECURE outcome is the default (block the send,
     mask the result, deny the tool). A regex/no-detector downgrade of a failed AI redaction is a leak.
   - **Capabilities are ALLOW-listed, never deny-listed.** A denylist is fail-open: a dep bump or a
     renamed field silently re-exposes a primitive. Enumerate what is PERMITTED; deny the rest.
   - **Remote assets are integrity-pinned AND from the OFFICIAL first-party source.** No
     code/model/wasm/wheel/binary over the network without a pinned hash or commit SHA — a TLS-only
     fetch run in a privileged process is arbitrary code exec. Canonical origin only (the author's HF
     org, PyPI, the tool's own releases), never a mirror or public CDN; if only a community re-export
     exists, re-export it OURSELVES, sha256-pinned. State the origin in the change.
   - **The process/isolation boundary is preserved.** The agent browser, MCP broker, fs worker, NER
     worker and Python jail run OUT of main ON PURPOSE. Never collapse one back, weaken a sandbox
     rule, or hand a child a secret it doesn't need. Bind the MINIMAL path/host/tool set.
   - **The renderer is untrusted for security decisions.** A UI confirm is UX; enforce the real
     check in main too — a renderer XSS can call any exposed IPC directly.
   - **No secret is logged; identity/authority comes from the verified token**, never a
     client-supplied id/email/cost/role in a request body.

   Then MECHANICALLY verify: rebuild the edited package(s) from `dist/`, `npx tsc --noEmit`,
   the tests **with a regression test for the exact hole you closed**, and build the app. A
   security fix with no test is not finished. A platform limit that leaves a residual is SAID and
   documented, never shipped as complete.
8. **Keep the USER-FACING help site in sync with the product — ALWAYS.** It lives outside this
   monorepo on `help.<domain>`: a page that overstates what redaction does misleads someone about
   where their data goes. When a change alters behaviour, a data flow, what's protected, or what a
   surface can do, SAY SO in the change; in-app copy making the same promise updates in the SAME change.
9. **One home per fact AND per behaviour — a "keep in sync" comment is a bug.** **Enforced**:
   `pnpm check:dup` (CI) fails on an app importing out of a SIBLING app and on a NEW sync-marker
   comment with no test named within 4 lines; backlog in `scripts/checks/dup-allowlist.json` (may
   only shrink). A fact used twice lives in ONE package and is IMPORTED: governable lists →
   `packages/catalog`; billing/credits → `packages/credits`; API shapes → `packages/schema` (types);
   provider bytes → `@openmasq/llm/wire`; a wire field shared with the server has its ONE home here.
   A behaviour copied "to keep the same shape" is the same bug: extract the skeleton. Before a second
   implementation, grep for the first. Copies that cannot import each other get a parity TEST.
10. **Keep the security surface LEGIBLE.** Group trust-boundary code by family: secrets-at-rest
    together, SSRF/egress guards together, the read-gate next to the handlers it guards. Moving a
    `@openmasq/redact/*` subpath file updates `package.json` `exports` AND `tsup.config.ts` `entry[]` **in lockstep**.
11. **The MODEL is the only thing that ever sees a fake — the outside always gets the REAL value.**
    `Settings.redactCategories` governs what the MODEL sees and NOTHING else. Outward is unconditional:
    every call leaves UN-REDACTED (`unredactArgs`) and returns RE-REDACTED (same vault), **the browser
    INCLUDED**. The accepted exfil residual + backstops: `packages/ui/src/agent/CLAUDE.md`.
12. **Never a frozen `#hex` on top of a theme token.** Ink/border/glyph on `var(--brand)`, `var(--hl-*)`
    or `var(--surface-*)` goes through the token that INVERTS with it (`--ink-on-brand`, `--ink-on-hl`).
    A literal truly needed is checked in the TWO themes (`:root`, `[data-theme="dark"]`) and says so.
13. **`FEATURES.md` is the MASTER file — it ships IN the change, never after.** It is the INDEX; a
    section's body lives in `features/<nn>-<slug>.md` (read the one you touch): what the app does, on
    which screen, how the user gets there, a checklist per feature. **Enforced**: `pnpm check:features`
    re-reads what the product single-sources (sections, settings tabs + entries, screens, modals) and
    fails on one no section names; cited paths must exist, counters must be real.
14. **The app ships in TWO languages — never a string hardcoded in one.** French is SOURCE, English
    beside it in the SAME commit: STRUCTURE in code, COPY in the typed catalogue (`useT()` in a component,
    `t: Messages` in a `.ts`). **Enforced**: `pnpm check:i18n`, accent-blind. Exceptions: `packages/i18n/CLAUDE.md`.

---

## Monorepo layout

```
apps/
  desktop/     Electron app (the product): src/main (IPC, DB, MCP, streaming) · src/preload
               (contextBridge → window.openmasq) · src/renderer · e2e/ (real OpenAI API)
  proxy/       Local redaction proxy: @openmasq/redact behind OpenAI/Anthropic/Gemini-compatible
               endpoints on loopback (CLI `openmasq-proxy`, wraps a tool, live console)
  mcp-broker/  MCP broker + OAuth AS (Google/Slack/GitHub) — a LOCAL sidecar the desktop spawns
packages/
  branding/    THE one home of the brand (branding.json: name, domains, scheme) — rule 9
  i18n/        Typed message catalogue (fr source + en), React-free — `check:i18n` ratchet
  ui/          ALL React UI + store + design system (styles.css → styles/). Platform-agnostic
  llm/         Provider clients + model registry + SSE + tool-calling
  redact/      The redaction engine (pure, unit-tested): redact/unredact/pseudonymize/vault
  mcp/         Redacting MCP client — tool calls redacted via redact
  catalog/     Single-source governable lists (models / MCP connectors / redaction categories)
  credits/     Billing tiers + credit amounts · schema/ persisted chat schema (types only)
  sync/        Cross-device E2E sync (vaults + records) + org audit · analytics/ analytics core
  connectors/  On-device-OAuth MCP tools
  tesseract2/  Vendored hardened OCR (worker_threads+WASM) · ort/ ONNX + WASM fallback · vendor/xlsx/
```

**Dependency direction:** `ui` → `llm`/`redact`/`mcp`/`catalog`/`schema`/`analytics`/`i18n`;
`mcp` → `redact`; `schema` → `redact` (types only); `sync` → `schema`; `analytics` dep-free;
`desktop` composes all and supplies the `Host`. **Apps never import apps** (`pnpm check:dup`).

## Where things live (go here first)

**A user-facing SCREEN is in `FEATURES.md`** → its `features/*.md` section, with how one reaches it.

| Need to… | Go to |
|---|---|
| Change redaction logic (rules, fakes, vault, formulas) | `packages/redact/src/engine/` (barrel: `packages/redact/src/index.ts`) |
| Desktop MCP connector flow (OAuth, creds, run tools) | `apps/desktop/src/main/mcp/` + `packages/ui/src/agent/` |
| The agentic tool-calling loop | `packages/ui/src/agent/` |
| App state, send pipeline, persistence | `packages/ui/src/state/` + `packages/ui/src/send/` |
| Design tokens (from the design source, never invented), the 2 themes, ALL CSS | `packages/ui/src/styles.css` + `packages/ui/src/styles/` |
| Provider/model list, pricing, context windows | `packages/llm/src/models/` |
| Main↔renderer API surface | `apps/desktop/src/preload/index.ts` (`window.openmasq`) |
| Local DB / files at rest | `apps/desktop/src/main/db/` + `apps/desktop/src/main/store/` |
| The local proxy (routes, masking, console) | `apps/proxy/src/` |

---

## Build / test (this saves real time and tokens)

- **Scope every run.** `pnpm test:related <files>` (no `--`) after a burst of edits;
  `pnpm test:changed` walks the graph from what git sees changed. Engine loop: `pnpm test:redact`.
  Fast path: `pnpm test:pure` (pure packages, no isolation) then `pnpm test:apps`. Full run ONCE
  before pushing. **Prefer the quiet variants** (`test:quiet`, `VITEST_QUIET=1`): a verbose run
  prints ~800 result lines into your context for nothing.
  ⚠️ `test:watch` never re-triggers outside an interactive terminal.
- **Read the section you need, not the file.** The gates keep source ≤ 300 LOC and docs ≤ 110 lines
  for that reason; a comment states an invariant or a trap, never history (history is `git log`).
- **turbo caches `build`/`typecheck`, never the tests.** Its cache lives OUT of tree
  (`~/.cache/turbo/openmasq`, set by `scripts/tooling/turbo.mjs`): always go through the pnpm
  scripts, never `npx turbo` directly, or you fill a second, cold cache. `typecheck` resolves
  `@openmasq/*` to `src` through the shared `tsconfig` paths (parity: `pnpm check:alias`), so it
  needs no build.
- **Only the app BUILD consumes the packages' `dist/`** — rebuild before it (`pnpm --filter @openmasq/<pkg> build`).
- Build: `cd apps/desktop && npx electron-vite build`. ⚠️ **CI's contract is
  `.github/workflows/verify.yml`, NOT `pnpm verify`** — it also runs `pnpm build`; replay ITS list
  before a push that triggers a release. `pnpm.supportedArchitectures` must keep `linux`: it
  decides which optional native binaries install on the CI runner.
- **Tailwind v4** is imported in `styles.css` as **utilities + theme ONLY (no preflight)**. Light IS the
  bare `:root`, dark re-points it (`[data-theme="dark"]`); `pnpm check:css` ratchets the btn/menu/card/chip families.

---

## Writing docs (rule 5, applied to this file too)

A `CLAUDE.md` is loaded **whole** into every session touching its directory, and long files
measurably reduce instruction-following. So: root ≤ 200 lines, nested ≤ 110 (`pnpm check:docs`).
**Write what the code CANNOT say**: invariants, rationale, a trap and why it bites. **Cut what's
derivable**: listings, signatures, dep lists, architecture. **No archaeology** — "X used to be Y"
belongs in the commit message; a rule that needs a bug story belongs in a test. **Prefer a test
to a paragraph.** A procedure is a skill. **Never `@import`** — it expands eagerly.

---

## Conventions

- **Logic in `.ts`, presentation in `.tsx`.**

- **NO worktree.** Everyone works in the SHARED TREE and touches only THEIR files; a file another
  session modified is not committed with yours. A wide refactor gets a `refactor/<slug>` branch; `dev`
  is the trunk; only a tag builds anything. Finished work (gates GREEN) is committed and pushed in the
  turn that finishes it; blocked or red work is SAID OUT LOUD, never pushed nor left to sleep. Small commits.
- **⛔ This is the PUBLIC app repository.** Nothing that describes ANOTHER repository's internals
  (the hosted API, the landing, the help site, deployment) lives in a tracked file: no layout, file,
  function, column or pipeline of theirs. Describe a contract from the app's side only.
- **⛔ A security fix is NEVER described.** Commit message, PR title, release note: say what the
  code does NOW, never what was exposed, in which version, nor since when. The MECHANISM is
  documented in full in the guard's comment and the test that pins it, as a property to hold.
- **Deployment order follows the DIRECTION of an app ⇄ API contract change.** Additive: any order.
  RESTRICTIVE (the server refuses what it accepted): installed base first, server once convergence is OBSERVED.
- **⛔ A commit is written in ENGLISH and has one author: the human answering for it.** No trace
  of a tool anywhere: no assistant `Co-Authored-By:`, no "generated with", no model name — not in
  the message, the body, nor a release note. Commit only when asked.
