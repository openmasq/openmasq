# openmasq / redact — agent guide

Privacy-first multi-model desktop chat. Sensitive data is **redacted before it leaves the machine**
(the model only ever sees fakes); the reply is **un-redacted** with the same per-conversation vault.

```
prompt ──redact──▶ what the model receives ──model──▶ reply ──de-redact──▶ shown
```

Models are reached with real **API keys**, or on **the app's own key** through the gateway
(metered on credits). The **keyless web-session** path (driving a signed-in ChatGPT/Claude
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
   frozen in `scripts/file-size-allowlist.json` fails if it GROWS past its frozen size.
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
   `shot.e2e.ts`/`lib-shot.e2e.ts` = screenshots). Env-gated in `apps/desktop/e2e/helpers.ts`.
   Unit tests (`pnpm test`) are free — run them constantly.
5. **Document as you change, in the RIGHT file.** Every app/package has a `CLAUDE.md`; when
   you change its structure, public exports, build steps or conventions, update it **in the
   same change**. **Enforced**: `pnpm check:docs` fails on a doc naming a path that no longer
   exists, and on doc bloat. See **Writing docs**.
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
   `scripts/dup-allowlist.json` (may only shrink). A **fact** used by two workspaces (a billing
   tier, a credit amount, an RBAC key, an API shape, a wire field) lives in ONE package and is
   IMPORTED: governable lists → `packages/catalog`; billing/credits → `packages/credits`;
   cross-app API shapes → types-only (`packages/schema`); provider bytes → `@openmasq/llm/wire`.
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
    call leaves un-redacted and its result returns re-redacted (same vault), **the browser
    INCLUDED** — a search must query the REAL value or it answers about nobody. Un-redact args
    with `unredactArgs` (a fake reaches a URL ENCODED). The exfil residual this ACCEPTS + the
    backstops that remain: `packages/ui/src/agent/CLAUDE.md`.
12. **Never a frozen `#hex` on top of a theme token.** Ink/border/glyph sitting on `var(--brand)`,
    `var(--hl-*)` or a `var(--surface-*)` goes through the token that INVERTS with it
    (`--ink-on-brand`, `--ink-on-hl`): a literal assumes a fixed ground, and the dark-GREEN theme
    re-points `--brand` at that very light lime (1:1 contrast, text gone). A literal that is
    truly needed is checked in all FOUR themes (light, dark, blue, blue-dark) and says so.
13. **`FEATURES.md` is the MASTER file — it ships IN the change, never after.** What the app
    does, on which screen, how the user gets there, checklist per feature. **Enforced**:
    `pnpm check:features` re-reads the lists the product single-sources (sections, settings
    tabs + entries, screen folders, modals) and fails on one it doesn't name; cited paths
    must exist, stated counters must be the real ones — a number nothing can recompute does
    not belong there. Adding OR removing a screen/tab/setting/modal edits it in the same commit.

---

## Monorepo layout

```
apps/
  desktop/     Electron app (the product): src/main (IPC, DB, MCP, streaming) · src/preload
               (contextBridge → window.openmasq) · src/renderer · e2e/ (real OpenAI API)
  web/         SPA React+Vite : /preview harness + the org ADMIN console. Ships WITH the backend in
               ONE Vercel project (same-origin API)
  backend/     Remote API (Express/Knex/Postgres/Supabase JWT/Stripe): billing, accounts,
               settings sync, org admin (RBAC + audit log)
  gateway/     Inference gateway (proxy + credit metering) AND the server-side redaction
               endpoint (reuses packages/redact; same vault → reversible)
  api/         MCP broker + OAuth AS (Google/Slack/GitHub) — a LOCAL sidecar the desktop spawns
  auth/        Env-INDEPENDENT OAuth-only fn: client secrets + the code→token exchange for
               flows that can't run on-device (Slack). DATA never transits; relay single-use
  analytics-fn/ Edge relay → PostHog (server-side key) + Contentful proxy
  updates/                       (no note needed — it does what it is called)
packages/
  branding/    THE one home of the brand (branding.json: name, domains, scheme) — rule 9
  ui/          ALL React UI + store + design system (styles.css). Platform-agnostic
  llm/         Provider clients + model registry + SSE + tool-calling
  redact/      The redaction engine (pure, unit-tested): redact/unredact/pseudonymize/vault
  mcp/         Redacting MCP client — tool calls redacted via redact
  catalog/     Single-source governable lists (models / MCP connectors / redaction categories)
  credits/     Billing tiers + credit amounts · schema/ persisted chat schema · emails/ mail
  sync/        Cross-device E2E sync (vaults + records) + org audit · analytics/ analytics core
  connectors/  On-device-OAuth MCP tools
  tesseract2/  Vendored hardened OCR (worker_threads+WASM) · ort/ ONNX+repli WASM · vendor/xlsx/
```

**Dependency direction:** `ui` → `llm`/`redact`/`mcp`/`catalog`/`schema`/`analytics`; `mcp` → `redact`;
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
| Design tokens, the 4 themes, ALL CSS | `packages/ui/src/styles.css` + `packages/ui/src/styles/` |
| Provider/model list, pricing, context windows | `packages/llm/src/models/` |
| Main↔renderer API surface | `apps/desktop/src/preload/index.ts` (`window.openmasq`) |
| Local DB / files at rest | `apps/desktop/src/main/db/` + `apps/desktop/src/main/store/` |

Visual reference: the design source lives OUTSIDE this repo — tokens land in `packages/ui/src/styles.css`, never invented by a task.

---

## Build / test gotchas (this saves real time)

- **Ne PAS coder puis tester en boucle.** `pnpm test:changed` après chaque salve d'édition — il remonte le graphe depuis ce que git voit changé (toucher `package.json`/`vitest.config.ts` le fait retomber au run complet, c'est correct) ; `pnpm test:related <fichiers>` pour cibler — **sans `--`**, pnpm l'avale. Une salve sur le MOTEUR redact tire ~216 fichiers (~31 s : le couplage) — pour CETTE boucle-là, `pnpm test:redact` (~4 s, `--no-isolate` scopé, ses limites commentées dans `vitest.config.ts`). Complet avant de pousser.
  ⚠️ **`test:watch` ne se redéclenche JAMAIS hors terminal interactif** (mesuré) : en arrière-plan
  il donne un run puis un silence qu'on prend pour du vert.
- **turbo cache `build`/`typecheck`, JAMAIS les tests — exprès** : un seul process vitest racine réutilise ses workers (`forks`→`threads` = 370 s→85 s), vingt tâches turbo repaieraient vingt fois la collecte. Ce qui rend son cache utile est commenté clé par clé dans `turbo.json` — les `inputs` (sans quoi le `CLAUDE.md` qu'impose la règle 5 rebuildait tout l'aval) et les `outputs` (en rater un rend la tâche non restituable). Cache turbo posé HORS de l'arbre (survit à un re-clone) : `scripts/turbo.mjs`.
- **Seul le BUILD d'app consomme le `dist/` des packages** — rebuild avant lui
  (`pnpm --filter @openmasq/<pkg> build`) ; tests et `dev` résolvent `src`
  (`scripts/vitest.workspaceAlias.ts`, copie tsconfig tenue par `pnpm check:alias`). ⚠️ Le
  `typecheck` d'un PACKAGE, lui, lit les `dist/*.d.ts` (seul `apps/desktop` alias vers `src`).
- Build : `cd apps/desktop && npx electron-vite build`. ⚠️ **Le contrat de la CI est `.github/workflows/verify.yml`, PAS `pnpm verify`** — il lance en plus `pnpm build`. Avant un push qui déclenche une release, rejouer SA liste : s'en remettre au script qui porte le nom a mis `dev` au rouge deux fois de suite. ⚠️ Et **`pnpm.supportedArchitectures` doit garder `linux`** : il décide quels binaires natifs OPTIONNELS s'installent, donc le restreindre à darwin+win32 pour l'empaquetage desktop prive esbuild et rollup du leur sur un runner Ubuntu et tue TOUT build de CI — invisible en local, où tout compile.
- **Tailwind v4** est importé dans `styles.css` en **utilities + theme SEULEMENT (pas de preflight)**, pour que le reset de l'app garde la main. Tokens + les QUATRE thèmes qui les re-pointent (`[data-theme="dark"|"blue"|"blue-dark"]`, light = aucun) y vivent aussi.

---

## Writing docs (rule 5, applied to this file too)

A `CLAUDE.md` is loaded **whole** into every session touching its directory, and long files measurably **reduce instruction-following**. So:
- **Cap ~200 lines** (`pnpm check:docs`; the allowlist may shrink, never grow — pay a new line
  by cutting one). **Detail goes in a NESTED `CLAUDE.md`**, loaded on demand
  (`packages/ui/src/send/CLAUDE.md`). **Never `@import`** — it expands eagerly.
- **Write what the code CANNOT say**: invariants, rationale, a trap and why it bites. **Cut what's derivable** — listings, signatures, dep lists, architecture.
- **No archaeology.** "X used to be Y" belongs in the commit message; a rule that needs a bug story to be believed belongs in a test.
- **Prefer a test to a paragraph** — name the test that pins an invariant (`send/preflight.test.ts` pins `greyed ⇔ refused`). **A procedure is a skill**, not a section.

---

## Conventions

- **Logic in `.ts`, presentation in `.tsx`.** Keep them separate.
- **PAS de worktree, PLUS JAMAIS** (décision 11/08 — l'ancienne convention « une session = un worktree » est abolie, sa machinerie démontée). Tout le monde travaille dans L'ARBRE PARTAGÉ, directement sur `dev` ; on ne touche qu'à SES fichiers, et un fichier déjà modifié par une autre session ne se commite pas avec les siens. ⚠️ **Un travail FINI se commite et se pousse dans le tour qui le finit**, jamais « plus tard » — du travail non poussé s'était accumulé en six branches le 11/08, dont une qui réappliquait les commits d'une autre. « Fini » veut dire GATES VERTES : `dev` déclenche les déploiements, donc un travail bloqué ou rouge se DIT au lieu de se pousser, et ne se laisse pas dormir pour autant.
- **⛔ Un correctif de sécurité ne se DÉCRIT jamais.** Message de commit, titre de PR, note de version : on dit ce que le code fait DÉSORMAIS, jamais ce qui était exposé, dans quelle version, ni depuis quand. Pas d'inventaire de ce qui partait, pas de fichier nommé, pas de compteur avant/après, pas de « corrigé » — un historique se lit, et énumérer le trou qu'on vient de fermer arme qui tient encore la version d'avant. Le mécanisme, lui, se documente à fond : il vit dans le commentaire du garde et dans le test qui l'épingle, décrit comme une propriété à tenir et non comme une faille qu'on a eue. Même règle que pour les notes de version (« les corrections restent vagues »), appliquée à tout ce qui est durable.
- **L'ordre des déploiements suit le SENS du changement de contrat app ⇄ API.** Additif (champ optionnel, nouvelle route) : n'importe quel ordre. RESTRICTIF (le serveur refuse ce qu'il acceptait — allow-list resserrée, champ rendu obligatoire) : le PARC d'abord, le serveur APRÈS convergence constatée — elle se lit dans `users.user_client_version` (posé par `attachUser` depuis l'en-tête d'identité client), jamais ne se suppose. Un client à jour face à un serveur en retard dégrade poliment ; l'inverse casse le parc installé.
- **⛔ Un commit s'écrit en ANGLAIS, et il n'a qu'un auteur : l'humain qui en répond.** Message, corps, titre de PR : anglais — l'historique d'un dépôt public se lit par des gens qui n'ont pas le français, et un blâme illisible ne sert personne. Et **aucune trace d'outil, nulle part** : pas de trailer `Co-Authored-By:` d'un assistant, pas de « generated with », pas de nom de modèle, ni dans le message, ni dans le corps, ni dans une note de version. Ce n'est pas de la pudeur : une signature partagée avec un outil brouille QUI répond du changement, et c'est la seule chose qu'un historique doit dire avec certitude. Commiter uniquement quand c'est demandé.
