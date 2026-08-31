import { defineConfig } from "vitest/config";
import { workspaceSrcAlias, CORPUS_TESTS } from "./scripts/vitest.workspaceAlias";

/**
 * Les BANCS corpus — `pnpm test:corpus`. Rappel/précision du moteur de redaction sur
 * des documents réels : plusieurs secondes par corpus, pipeline complet à chaque cas.
 * Sortis de `pnpm test` pour que les unitaires restent un signal net (un rouge = un
 * bug, jamais « la machine était chargée ») ; le timeout large est la conséquence
 * assumée — un banc mesure, il ne borne pas la latence.
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
