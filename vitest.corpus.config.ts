import { defineConfig } from "vitest/config";
import { workspaceSrcAlias, CORPUS_TESTS } from "./scripts/vitest.workspaceAlias";

/**
 * The corpus BENCHES — `pnpm test:corpus`. Recall/precision of the redaction engine on
 * real documents: several seconds per corpus, the full pipeline on every case.
 * Taken out of `pnpm test` so the unit tests stay a clean signal (a red = a bug, never
 * « la machine était chargée »); the generous timeout is the accepted consequence — a
 * bench measures, it does not bound latency.
 */
export default defineConfig({
  resolve: { alias: workspaceSrcAlias },
  test: {
    environment: "node",
    setupFiles: ["./scripts/vitest.webstorage-setup.ts"],
    include: CORPUS_TESTS,
    testTimeout: 120_000,
    passWithNoTests: false,
  },
});
