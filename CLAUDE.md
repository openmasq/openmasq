# openmasq / redact — agent guide

Privacy-first multi-model desktop chat. Sensitive data is **redacted before it leaves the machine**
(the model only ever sees fakes); the reply is **un-redacted** with the same per-conversation vault.

```
prompt ──redact──▶ what the model receives ──model──▶ reply ──de-redact──▶ shown
```

Models are reached with real **API keys** — or, when a build opens the `OPENMASQ_BILLING`
gate, on the app's key through the gateway (private `infra` repo, metered on credits). The **keyless web-session** path (driving a signed-in ChatGPT/Claude
tab) was REMOVED from the desktop product; its config package and only consumer (a
browser extension) live outside this repo.
**Brand VALUES have ONE home** (rule 9): `packages/branding/branding.json`, via `@openmasq/branding` (`BRAND`, `brandHost`, `brandKey`…) — runtime/wire/disk values derive from it, never a literal. The NAME also serves as the technical namespace (npm scope, `OPENMASQ_*` env, `window.openmasq`); `check:brand` guards the RETIRED codename instead.

> This file is the **map**, and it is loaded into every session — keep it that way. The
> detail lives in each workspace's own `CLAUDE.md`, which loads on demand when you work in
> that folder. See **Writing docs** below before adding anything here.

---

## ⛔ Hard rules (always)

1. **Never let a file exceed 300 LOC.** Split before you cross it (`.ts/.tsx/.css`).
   **Enforced**: `pnpm check:loc` (CI), TWO teeth — a NEW over-cap file fails, and a file
   frozen in `scripts/checks/file-size-allowlist.json` fails if it GROWS past its frozen size.
   A backlog **in the tool**, not only in this sentence: adding to a listed file means
   splitting it. Deliberate growth: `--update --allow-growth` + the reason in the commit.
2. **Split into folders cleverly.** Prefer a feature folder with an `index.ts` barrel over a
   fat file or a flat dump. A component that grows sub-parts becomes `Thing/` (`Thing.tsx`,
   `parts/`, `useThing.ts`, `index.ts`). Group by feature/domain, not by file-type.
   **~15+ sibling source files is a flat-dump smell** — sub-folder it by theme. **One concept
   = ONE home** (never the same domain in two parallel folders). But don't over-fragment:
   7-deep paths for 30-LOC files are as bad as a flat dump. Shallow, thematic, barreled.
3. **Reskins/refactors preserve behavior.** The UI is a thin shell over real logic (vault,
   store, IPC). Change the visual layer only, unless that IS the task.
4. **e2e is slow and costs real money — never run it casually.** `apps/desktop/e2e` drives the
   built app against the **real OpenAI API** (`openai-redaction.e2e.ts` = document redaction;
   `shot.e2e.ts`/`lib-shot.e2e.ts` = screenshots). Each spec SKIPS itself without its provider key.
   Unit tests (`pnpm test`) are free — run them constantly.
5. **Document as you change, in the RIGHT file.** Every app/package has a `CLAUDE.md`; when
   you change its structure, public exports, build steps or conventions, update it **in the
   same change**. **Enforced**: `pnpm check:docs`, on the ROOT map ONLY — a path it names must
   exist and it may not bloat. The nested docs are gitignored: the gate never sees them.
6. **Never write inline CSS — always Tailwind.** No `style={{…}}`. Use utilities (`bg-brand`,
   `text-strong`, `rounded-xl`) or a semantic class in `packages/ui/src/styles.css` mapped to
   tokens. Inline `style` ONLY for a genuinely runtime-computed value (a width from JS, a
   per-item colour from data). Static styling is always Tailwind.
7. **⚠️ SECURITY IS NON-NEGOTIABLE — re-verify the trust AND process boundary after every
   implementation.** Real PII, provider keys, a de-redacted code sandbox, an agent-driven
   browser, MCP tools acting on the user's accounts. Any change touching **IPC handlers,
   `spawn`/`exec`/`utilityProcess`, network egress, the redaction pipeline/vault,
   secrets-at-rest, MCP tool gates, the Python sandbox, the agent browser, auth/RBAC,
   metering** is NOT done until ALL of these hold, and you can state so in the change:
   - **Fail CLOSED.** On error/timeout/unknown, the SECURE outcome is the default (block the
     send, mask the result, deny the tool). A regex/no-detector downgrade of a failed AI
     redaction is a leak.
   - **Capabilities are ALLOW-listed, never deny-listed.** A denylist is fail-open: a dep bump
     or renamed field silently re-exposes a primitive (the browser-tool fix: a 5-name denylist
     missed ~70 cookie/storage/network tools). Enumerate what is PERMITTED; deny the rest.
   - **Remote assets are integrity-pinned AND from the OFFICIAL first-party source.** No
     code/model/wasm/wheel/binary over the network without a pinned hash or commit SHA. **A
     TLS-only CDN fetch that then runs in a privileged process is arbitrary code exec.**
     Download ONLY from the vendor's canonical origin (the model author's HF org, PyPI, the
     tool's own GitHub releases, the official tessdata repo) — **NEVER a third-party wrapper,
     mirror, re-upload, or public CDN** (jsdelivr/unpkg). If only a community re-export exists,
     **re-export it OURSELVES and vendor it sha256-pinned**. State the origin in the change.
     (Residual: the NER weights are a `Xenova/*` community re-upload of mBERT on a pinned commit —
     the desktop bundles them sha256-pinned + offline, dev builds only commit-pin; a first-party re-export is the tracked follow-up.)
   - **The process/isolation boundary is preserved.** The agent browser, MCP broker, fs worker,
     NER worker and Python jail run OUT of main ON PURPOSE (CDP is process-global; de-redacted
     code is untrusted). Never collapse one back, weaken a sandbox rule, or hand a child a
     secret it doesn't need. Bind/allow the MINIMAL path/host/tool set.
   - **The renderer is untrusted for security decisions.** A UI confirm/gate is UX; enforce the
     real check in main too — a renderer XSS can call any exposed IPC directly.
   - **No secret is logged; identity/authority comes from the verified token**, never a
     client-supplied `auth_id`/`email`/cost/role in a request body.

   Then MECHANICALLY verify: rebuild the edited package(s) from `dist/`, `npx tsc --noEmit`,
   `pnpm test` **with a regression test for the exact hole you closed**, and build the app.
   A security fix with no test is not finished. If a finding can't be fully closed in-process
   (a platform limit), say so and document the residual — never ship a partial mitigation as
   if it were complete.
8. **Keep the USER-FACING help site in sync with the product — ALWAYS.** It lives **outside
   this monorepo** (like the landing), published on `help.<domain>`, so a page it states is
   stated ONLINE. Its accuracy is a **trust obligation** — a doc that overstates what
   redaction does misleads someone about where their data goes. When a change alters product
   behaviour, a data flow, what's protected, or what a surface can do, SAY SO in the change
   so the help site follows; in-app copy making the same promise (rule 8 applies to it too)
   updates in the SAME change.
9. **One home per fact AND per behaviour — a "keep in sync" comment is a bug, not a safeguard.**
   **Enforced**: `pnpm check:dup` (CI) fails on any app importing out of a SIBLING app, and on a
   NEW sync-marker comment with no test named within 4 lines; backlog frozen in
   `scripts/checks/dup-allowlist.json` (may only shrink). A **fact** used by two workspaces (a billing
   tier, a credit amount, an RBAC key, an API shape, a wire field) lives in ONE package and is
   IMPORTED: governable lists → `packages/catalog`; billing/credits → `packages/credits`;
   cross-app API shapes → types-only (`packages/schema`); provider bytes → `@openmasq/llm/wire`.
   The server side lives in another repository now: a wire field or a billing fact it shares
   with this one still has ONE home here (`packages/credits`, `packages/schema`, `packages/sync`).
   A **behaviour** copied "to keep the same shape" is the same bug with more surface — extract
   the skeleton and leave only the genuine point of variation at the call site
   (`useSyncChannel`'s resume signal is the model). Before writing a second implementation of
   anything, grep for the first. If two copies truly cannot import each other (HCL ⇄ TS, two
   runtimes), add a parity TEST that READS both and NAME it on the marker line — a comment
   cannot fail CI, and a stale one invites the next reader to recreate the copy.
10. **Keep the security surface LEGIBLE.** Group trust-boundary code so a reviewer sees a family
    at a glance: the secrets-at-rest stores together, the SSRF/egress guards together, the
    read-gate next to the handlers it guards. A split that scatters a fail-closed check makes
    rule 7 harder to verify. And when you move a `@openmasq/redact/*` subpath file, update
    `package.json` `exports` AND `tsup.config.ts` `entry[]` **in lockstep** — verify every
    subpath still resolves.
11. **The MODEL is the only thing that ever sees a fake — the outside always gets the REAL
    value.** `Settings.redactCategories` governs what the MODEL sees and NOTHING else; a
    per-category gate on what the OUTSIDE receives is the bug. Outward is unconditional: every
    call leaves UN-REDACTED and its result returns RE-REDACTED (same vault), **the browser
    INCLUDED** — a search must query the REAL value or it answers about nobody. Un-redact args
    with `unredactArgs` (a fake reaches a URL ENCODED). The exfil residual this ACCEPTS + the
    backstops that remain: `packages/ui/src/agent/CLAUDE.md`.
12. **Never a frozen `#hex` on top of a theme token.** Ink/border/glyph sitting on `var(--brand)`,
    `var(--hl-*)` or a `var(--surface-*)` goes through the token that INVERTS with it
    (`--ink-on-brand`, `--ink-on-hl`): a literal assumes a fixed ground, and the dark theme
    re-points `--brand`, `--lime` and every surface (a lime pinned on the brand is near-black
    there). A literal truly needed is checked in the TWO themes (`:root`, `[data-theme="dark"]`) and says so.
13. **`FEATURES.md` is the MASTER file — it ships IN the change, never after.** What the app
    does, on which screen, how the user gets there, checklist per feature. **Enforced**:
    `pnpm check:features` re-reads the lists the product single-sources (sections, settings
    tabs + entries, screen folders, modals) and fails on one it doesn't name; cited paths
    must exist, stated counters must be the real ones — a number nothing can recompute does
    not belong there. Adding OR removing a screen/tab/setting/modal edits it in the same commit.
14. **The app ships in TWO languages — never a string hardcoded in one.** French is SOURCE, English
    ships beside it in the SAME commit: STRUCTURE (ids, order, flags) stays in code, COPY goes to
    the typed catalogue — `useT()` in a component, `t: Messages` in a `.ts` module. **Enforced**:
    `pnpm check:i18n` (frozen ratchet) is **accent-blind** — hardcoded English fails like hardcoded
    French, in a label TABLE as in a JSX attribute. What is NOT: `packages/i18n/CLAUDE.md`.

---

## Monorepo layout

```
apps/
  desktop/     Electron app (the product): src/main (IPC, DB, MCP, streaming) · src/preload
               (contextBridge → window.openmasq) · src/renderer · e2e/ (real OpenAI API)
  mcp-broker/  MCP broker + OAuth AS (Google/Slack/GitHub) — a LOCAL sidecar the desktop spawns
  (the SERVER side — API, gateway, admin console, update feed, relays, e-mail templates —
   moved to the private `infra` repository on 2026-08-31; this repo builds and runs with none of it)
packages/
  branding/    THE one home of the brand (branding.json: name, domains, scheme) — rule 9
  i18n/        Typed message catalogue (fr source + en), React-free — `check:i18n` ratchet
  ui/          ALL React UI + store + design system (styles.css). Platform-agnostic
  llm/         Provider clients + model registry + SSE + tool-calling
  redact/      The redaction engine (pure, unit-tested): redact/unredact/pseudonymize/vault
  mcp/         Redacting MCP client — tool calls redacted via redact
  catalog/     Single-source governable lists (models / MCP connectors / redaction categories)
  credits/     Billing tiers + credit amounts · schema/ persisted chat schema (types only)
  sync/        Cross-device E2E sync (vaults + records) + org audit · analytics/ analytics core
  connectors/  On-device-OAuth MCP tools
  tesseract2/  Vendored hardened OCR (worker_threads+WASM) · ort/ ONNX + WASM fallback · vendor/xlsx/
```

**Dependency direction:** `ui` → `llm`/`redact`/`mcp`/`catalog`/`schema`/`analytics`/`i18n`; `mcp` → `redact`;
`schema` → `redact` (types only); `sync` → `schema`; `analytics` dep-free;
`desktop` composes all and supplies the `Host`. **Apps never import apps** (`pnpm check:dup`).

---

## Where things live (go here first)

**A user-facing SCREEN is in `FEATURES.md`**, with how one reaches it.

| Need to… | Go to |
|---|---|
| Change redaction logic (rules, fakes, vault, formulas) | `packages/redact/src/engine/` (barrel: `packages/redact/src/index.ts`) |
| Desktop MCP connector flow (OAuth, creds, run tools) | `apps/desktop/src/main/mcp/` + `packages/ui/src/agent/` |
| The agentic tool-calling loop | `packages/ui/src/agent/mcpAgent.ts` |
| App state, send pipeline, persistence | `packages/ui/src/state/store.ts` + `packages/ui/src/send/` |
| Design tokens, the 2 themes, ALL CSS | `packages/ui/src/styles.css` + `packages/ui/src/styles/` |
| Provider/model list, pricing, context windows | `packages/llm/src/models/` |
| Main↔renderer API surface | `apps/desktop/src/preload/index.ts` (`window.openmasq`) |
| Local DB / files at rest | `apps/desktop/src/main/db/` + `apps/desktop/src/main/store/` |

Visual reference: the design source lives OUTSIDE this repo — tokens land in `packages/ui/src/styles.css`, never invented by a task.

---

## Build / test gotchas (this saves real time)

- **Do NOT code then test in a loop.** `pnpm test:changed` after each burst of edits — it walks the graph up from what git sees changed (touching `package.json`/`vitest.config.ts` drops it back to the full run, which is correct); `pnpm test:related <files>` to target — **no `--`**, pnpm swallows it. A burst on the redact ENGINE pulls ~216 files (~31 s: the coupling) — for THAT loop, `pnpm test:redact` (~4 s, scoped `--no-isolate`, its limits commented in `vitest.config.ts`). Full run before pushing.
  ⚠️ **`test:watch` NEVER re-triggers outside an interactive terminal** (measured): in the
  background it gives one run, then a silence that reads as green.
- **turbo caches `build`/`typecheck`, NEVER the tests — on purpose**: one root vitest process reuses its workers (`forks`→`threads` = 370 s→85 s), where twenty turbo tasks would pay for collection twenty times. What makes its cache useful is commented key by key in `turbo.json` — the `inputs` (without which the `CLAUDE.md` rule 5 mandates rebuilt everything downstream) and the `outputs` (miss one and the task can't be restored). The turbo cache lives OUTSIDE the tree (it survives a re-clone): `scripts/tooling/turbo.mjs`.
- **Only the app BUILD consumes the packages' `dist/`** — rebuild before it
  (`pnpm --filter @openmasq/<pkg> build`); tests and `dev` resolve `src`
  (`scripts/vitest/vitest.workspaceAlias.ts`, tsconfig copy held by `pnpm check:alias`). ⚠️ A
  PACKAGE's `typecheck`, however, reads `dist/*.d.ts` (only `apps/desktop` aliases to `src`).
- Build: `cd apps/desktop && npx electron-vite build`. ⚠️ **CI's contract is `.github/workflows/verify.yml`, NOT `pnpm verify`** — it also runs `pnpm build`. Before a push that triggers a release, replay ITS list: trusting the script that carries the name put `dev` in the red twice in a row. ⚠️ And **`pnpm.supportedArchitectures` must keep `linux`**: it decides which OPTIONAL native binaries get installed, so restricting it to darwin+win32 for desktop packaging deprives esbuild and rollup of theirs on an Ubuntu runner and kills EVERY CI build — invisible locally, where everything compiles.
- **Tailwind v4** is imported in `styles.css` as **utilities + theme ONLY (no preflight)**, so the app's own reset keeps the upper hand. Tokens + the TWO themes live there too: light IS the bare `:root`, dark re-points it (`[data-theme="dark"]`); `pnpm check:css` ratchets the btn/menu/card/chip class families.

---

## Writing docs (rule 5, applied to this file too)

A `CLAUDE.md` is loaded **whole** into every session touching its directory, and long files measurably **reduce instruction-following**. So:
- **Cap ~200 lines** (`pnpm check:docs`; the allowlist may shrink, never grow — pay a new line
  by cutting one). **Detail goes in a NESTED `CLAUDE.md`**, loaded on demand
  (`packages/ui/src/send/CLAUDE.md`). **Never `@import`** — it expands eagerly.
- **Write what the code CANNOT say**: invariants, rationale, a trap and why it bites. **Cut what's derivable** — listings, signatures, dep lists, architecture.
- **No archaeology.** "X used to be Y" belongs in the commit message; a rule that needs a bug story to be believed belongs in a test.
- **Prefer a test to a paragraph** — name the test that pins an invariant (`send/modelAvailability.test.ts` pins `grisé ⇔ refusé`). **A procedure is a skill**, not a section.

---

## Conventions

- **Logic in `.ts`, presentation in `.tsx`.** Keep them separate.
- **NO worktree, NEVER again** (the old "one session = one worktree" convention is abolished, its machinery dismantled). Everyone works in the SHARED TREE, directly on `dev`; you touch only YOUR files, and a file already modified by another session is not committed with yours. ⚠️ **Finished work is committed and pushed in the turn that finishes it**, never "later" — unpushed work once piled up across six branches, one of which re-applied another's commits. "Finished" means GATES GREEN: `dev` triggers the deployments, so work that is blocked or red is SAID OUT LOUD instead of pushed — and is not left to sleep either.
- **⛔ A security fix is NEVER described.** Commit message, PR title, release note: say what the code does NOW, never what was exposed, in which version, nor since when. No inventory of what was leaving, no file named, no before/after counter, no "fixed" — history is readable, and enumerating the hole you just closed arms whoever still runs the previous version. The MECHANISM, on the other hand, is documented in full: it lives in the guard's comment and in the test that pins it, described as a property to hold rather than a flaw we had. Same rule as for release notes ("fixes stay vague"), applied to everything durable.
- **Deployment order follows the DIRECTION of the app ⇄ API contract change.** Additive (optional field, new route): any order. RESTRICTIVE (the server refuses what it used to accept — a tightened allow-list, a field made mandatory): the INSTALLED BASE first, the server AFTER convergence is OBSERVED — it is read in `users.user_client_version` (set by `attachUser` from the client-identity header), never assumed. An up-to-date client facing a lagging server degrades politely; the reverse breaks every install out there.
- **⛔ A commit is written in ENGLISH, and it has one author: the human answering for it.** Message, body, PR title: English — a public repository's history is read by people who have no French, and an unreadable blame serves nobody. And **no trace of a tool, anywhere**: no assistant `Co-Authored-By:` trailer, no "generated with", no model name — not in the message, not in the body, not in a release note. This is not modesty: a signature shared with a tool blurs WHO answers for the change, and that is the one thing a history must state with certainty. Commit only when asked.
