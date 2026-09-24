import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { workspaceSrcAlias, CORPUS_TESTS } from "./scripts/vitest/vitest.workspaceAlias";
import { scopeExclude } from "./scripts/vitest/vitest.scopes";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The unit suite (`pnpm test`). Paid suites have their own configs and globs this one never
// matches: `*.eval.ts` (real model calls) and `*.recall.test.ts` (corpus benches).
export default defineConfig({
  resolve: {
    alias: [
      // `electron`'s entry resolves to the binary's PATH (and downloads it when missing), so
      // the suite never loads the real package: the stub keeps local and CI identical and
      // network-free. A test that needs a behaviour declares it with `vi.mock("electron")`.
      { find: /^electron$/, replacement: here("./scripts/vitest/vitest.electron-stub.ts") },
      // `@sentry/electron` imports `electron` internally through Node's resolver, which
      // ignores aliases — same remedy, same `vi.mock` escape hatch.
      { find: /^@sentry\/electron\/(main|renderer)$/, replacement: here("./scripts/vitest/vitest.sentry-electron-stub.ts") },
      ...workspaceSrcAlias,
    ],
  },
  test: {
    environment: "node",
    // Threads, not forks: collection is paid once per worker instead of once per process.
    // Per-file isolation stays on — the suite has order-dependent files under `vi.mock`;
    // `pnpm test:pure` lifts it only for the packages listed in `scripts/vitest/vitest.scopes.ts`.
    pool: "threads",
    // Bounds the heavy-document tests under load; costs nothing when nothing times out.
    testTimeout: 20_000,
    // VITEST_QUIET=1: one dot per file — for agents and CI logs, a verbose run is ~10k tokens.
    reporters: process.env.VITEST_QUIET ? ["dot"] : ["default"],
    exclude: ["**/node_modules/**", ...CORPUS_TESTS, ...scopeExclude(process.env)],
    // Node ≥26 ships stub web-storage globals that mask jsdom's; the shim grafts real Storage back.
    setupFiles: ["./scripts/vitest/vitest.webstorage-setup.ts"],
    // ⚠️ A test file no pattern matches is SILENTLY never run (`pnpm check:tests` guards it).
    // Every entry is a `**` glob over a whole tree, so a new subfolder needs no edit here.
    // `.tsx` is included wherever `.ts` is: a component test is a test.
    include: [
      "packages/**/src/**/*.test.{ts,tsx}",
      // Measurement code, outside `src/` on purpose; its one test pins the span predictor.
      "packages/redact/bench/**/*.test.ts",
      "apps/desktop/src/**/*.test.{ts,tsx}",
      // Build scripts don't ship but decide what ships (the per-arch ONNX sort).
      "apps/desktop/scripts/**/*.test.{ts,tsx}",
      "apps/proxy/src/**/*.test.{ts,tsx}",
      "apps/mcp-broker/src/**/*.test.{ts,tsx}",
      // Root tooling — the checks and the sandbox profile a session runs under.
      "scripts/**/*.test.{ts,tsx}",
    ],
    passWithNoTests: false,
  },
});
