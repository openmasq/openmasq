import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { workspaceSrcAlias, CORPUS_TESTS, NO_ISOLATE_UNSAFE_TESTS } from "./scripts/vitest.workspaceAlias";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Deterministic unit/integration tests for the fragile, pure pieces of the
// keyless pipeline — the DOM→Markdown serialiser and the reversible redaction —
// so we can exercise many prompts in CI without a real signed-in web session.
// Per-file `// @vitest-environment jsdom` opts the serialiser tests into a DOM.
//
// TWO PROJECTS, because one of them cannot run in this runtime. Everything below is
// the `unit` project (node/jsdom, threads). `apps/updates` is a Cloudflare Worker: its
// tests need workerd + Miniflare + R2 bindings, supplied by its OWN config
// (`apps/updates/vitest.config.ts`, the `@cloudflare/vitest-pool-workers` pool). Listing
// it as a PROJECT is what makes `pnpm test` run it too — adding its path to the `include`
// below would instead run Worker tests under node, where they cannot pass. Before that it
// was reachable by no runner at all: 64 assertions on the staged-rollout logic (who gets
// which app version), written and never executed.
const unit = defineConfig({
  resolve: {
    alias: [
      // ⚠️ `electron` is NEVER resolved to the real package in the suite. Its
      // `index.js` doesn't render an API but the binary's PATH, and if `path.txt`
      // is missing it DOWNLOADS 295 MB on import. Locally the binary is there; on a
      // runner it isn't, and the first test file that touches `electron` pays for
      // that download IN THE MIDDLE of the suite — so it fails if the network
      // hiccups, while another file importing the same module passes two minutes
      // later. A RACE, arbitrated by luck, that no local `pnpm test` can show.
      // The stub makes local and CI identical, and network-free.
      // `vi.mock("electron", …)` (21 files) wins over this alias: a test that needs
      // a behavior declares it, as before.
      { find: /^electron$/, replacement: here("./scripts/vitest.electron-stub.ts") },
      // ⚠️ Mandatory companion of the alias above. `@sentry/electron` imports `electron`
      // INTERNALLY; externalized (default), this import goes through NODE's resolver,
      // which ignores aliases → the real package, CommonJS module, "does not provide
      // an export named 'app'". And the INLINER is no better: its module-level init
      // reads `process.versions.electron` (absent outside Electron) and throws. So the
      // same remedy as for electron: a stub, and a test that needs a behavior
      // declares it via `vi.mock`. Symptom of the next package in this situation: this SyntaxError.
      { find: /^@sentry\/electron\/(main|renderer)$/, replacement: here("./scripts/vitest.sentry-electron-stub.ts") },
      ...workspaceSrcAlias,
    ],
  },
  test: {
    name: "unit",
    environment: "node",
    // WORKERS, not processes. Measured on the whole suite (475 files): 370 s in
    // `forks` (the default) versus ~85 s in `threads` — most of the gain comes from
    // COLLECTION, redone per file, which a thread pays once per worker instead of
    // once per process. ⚠️ PER-FILE ISOLATION IS KEPT, and this is no longer
    // "no gain": re-measured on 15/08/2026 (686 files), `--no-isolate` divides
    // the hot path by 2.7 (`related` on an engine file: 31 s → 11.5 s)… and turns
    // ~20 files red DEPENDING ON FILE ORDER (shared global state + importer
    // cache under `vi.mock`: three shuffled runs give three different failure
    // lists, ui/desktop/backend/gateway all mixed together). A false red that blames
    // the order rather than the code is the class of signal this repo has already
    // paid for twice — isolation stays. The VERIFIED exception: `pnpm test:redact`
    // (`--no-isolate` scoped to packages/redact, mock-users excluded — see
    // NO_ISOLATE_UNSAFE_TESTS), stable across 6 shuffled runs, 13 s → 4 s.
    // NB vitest 3.2: `isolate`/`pool` per PROJECT are ignored (root/CLI only) —
    // a non-isolated "pure" project next to an isolated "app" project doesn't work.
    pool: "threads",
    // The 5 s default was below the REAL duration of the heavy-document tests
    // (`releveRepartition`, `acteCautionnement`, `documents`): they hold up when idle and
    // time out under load, which produced reds that blamed no actual bug. A
    // timeout costs nothing when nothing times out — it only bounds the failure.
    testTimeout: 20_000,
    // The corpus benches live outside this repo (see CORPUS_TESTS) — a recall
    // bench is not a unit test, and neither is its timeout under load.
    // VITEST_NO_ISOLATE: set by `pnpm test:redact` ONLY — the CLI `--exclude`
    // is inert in projects mode (the project's exclude wins), so the fast path
    // goes through the config. Never set by hand on `pnpm test`.
    exclude: [
      "**/node_modules/**",
      ...CORPUS_TESTS,
      ...(process.env.VITEST_NO_ISOLATE ? NO_ISOLATE_UNSAFE_TESTS : []),
    ],
    // Node ≥26 ships stub `localStorage`/`sessionStorage` globals that mask jsdom's —
    // the shim (no-op outside jsdom files) grafts real Storage back. See the file header.
    setupFiles: ["./scripts/vitest.webstorage-setup.ts"],
    // ⚠️ A test file this list does not match is SILENTLY never run — worse than no
    // test, because the suite still reports green. So every entry is a `**` glob over
    // a whole source tree, and a new subfolder needs no edit here. The ONE narrow
    // exception is `apps/backend` (below), which has a reason that is not tidiness.
    // `.tsx` is included everywhere `.ts` is: a React component test is a test, and
    // making authors hand-write `React.createElement` to dodge the include is friction
    // for nothing (`scripts/test-kit.tsx` is the shared jsdom harness).
    include: [
      "packages/**/src/**/*.test.{ts,tsx}",
      // `packages/emails` is flat (no src/), so `packages/**/src/**` misses it entirely:
      // the outbound FROM/inbox single-source (`lib/`) and the release-note tooling
      // (`scripts/` — the Contentful→email mapping the preview and the audience
      // broadcast SHARE). One `**` glob per the rule above, not a per-folder list.
      "packages/emails/**/*.test.{ts,tsx}",
      // The desktop MAIN process (security-critical, electron-free units: the fs grant
      // gate, the read gate, secrets-at-rest, SSRF egress, the Python jail, the NER
      // integrity pin, the DB round-trip…), its IPC layer and the renderer's pre-paint
      // boot script. One glob: this used to be FIFTEEN hand-listed directories, and the
      // trap was documented twice in the CLAUDE.md tree instead of being fixed.
      "apps/desktop/src/**/*.test.{ts,tsx}",
      // The desktop BUILD scripts. They don't ship, but they decide what
      // ships: `archPrune.cjs`'s per-arch sort is the table that says which
      // ONNX engine goes into which .app, and getting it wrong there only shows up in use.
      "apps/desktop/scripts/**/*.test.{ts,tsx}",
      // MCP broker OAuth primitives (PKCE, redirect_uri, token store).
      "apps/mcp-broker/src/**/*.test.{ts,tsx}",
      // Scaleway redaction function: GPT-OSS detection (mocked fetch) + handler.
      // Scaleway analytics-fn: supertest e2e over the Express app (relay + release-notes).
      // The admin console: its PURE view logic (the Overview's pivot —
      // what the filters actually compute from the cube the backend returns),
      // and `src/` — the SPA's routes have lived there since the Vite switch, a test placed
      // in `src/routes/` would otherwise NEVER run (the warning above).
      // `apps/web/e2e` is Playwright and is named `*.e2e.ts`, so this glob cannot
      // catch it; nor `.next/`, there's no `*.test.ts` in there.
      // The showcase site (`apps/landing`) has left this monorepo (separate repo,
      // 18/08) — its suite now runs over there, not here.
      // ⚠️ `apps/backend` is the ONE tree that may NOT be globbed: `features/*/unitTest/**`
      // holds JEST supertest STEP HELPERS (exported functions, no `it`/`describe`), and
      // vitest picks them up and fails. Hence three narrow entries — the inference proxy
      // (model allow-list + SSE usage parser), the billing PARITY test (rule 9's only
      // guard between the Terraform/Stripe catalogue and the TS the app runs), the
      // feedback relay (payload allow-list + HTML escaping of untrusted free text), and
      // the Stripe return-URL resolver. Widening one means moving those helpers first.
      // A single `*`: the files PLACED in `subscriptions/` (the parity test, the
      // seats↔price calc), never `subscriptions/unitTest/**` and its jest helpers.
      // Same, a single `*`: the subscription GRANT (`features/admin/`) — the rules
      // for money writes granted without payment (which tier, which period, what
      // revoking resets). No jest helpers in this folder today; the single `*`
      // keeps this true if any are added.
      // A single `*`: the roles→flags projection (`flags.test.ts` — what the outside
      // is allowed to know about an account), never `users/unitTest/**` and its jest helpers.
      // The PUBLIC ROUTE (site requests): its guards are its tests.
      // Same, a single `*`: the sync direction-barrier predicate (which
      // device reads/writes which scope — vaults AND records), never `sync/unitTest/**`.
      // The Stripe webhook's trust rule (billing subject
      // resolution — subject.test.ts): pure logic with injected deps, no
      // jest helpers in this folder, the glob is safe.
      // One notch down, `lib/email/`: the Resend audience ROUTING. It's what
      // decides who a version announcement goes to — and its lack of a fallback is what
      // prevents a forgotten environment variable from sending the site's subscribers
      // into the broadcast. No jest helpers here, the glob is safe.
      // The GUARDS (`routes/middlewares/`): `requireSuperAdmin` decides who can credit
      // an account without payment — the repo's only authorization that gives out money.
      // The ROOT tooling. A single `*`: the files placed in `scripts/`, never
      // the vitest helpers around it. What's tested there decides what a session
      // can read and write (`claude-sandbox.sh` — `claude:sandbox`'s seatbelt profile),
      // and a wrong sandbox rule reads as a tool failure, not as a
      // rule bug — exactly what a test must catch in our place.
      "scripts/*.test.{ts,tsx}",
    ],
    passWithNoTests: false,
  },
});

export default defineConfig({
  test: {
    projects: [unit, ...(existsSync("apps/updates") ? ["./apps/updates"] : [])],
  },
});
