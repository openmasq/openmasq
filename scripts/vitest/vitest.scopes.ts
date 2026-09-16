/**
 * The two halves of the unit suite, for the fast path (`pnpm test:pure` / `pnpm test:apps`).
 *
 * PURE: electron-free, DOM-free packages whose test files share no module-level state, so
 * they run `--no-isolate` (one module graph per worker — collection is the suite's main
 * cost, and isolation re-pays it per file). APPS: `packages/ui` and `apps/desktop`, whose
 * tests lean on `vi.mock` + jsdom and stay isolated. `pnpm test` runs both, isolated.
 *
 * Per-project `isolate` is ignored by vitest 3.2, hence two commands rather than two projects.
 * A file that proves order-dependent under `--no-isolate` goes in NO_ISOLATE_UNSAFE_TESTS
 * (config-level: a CLI `--exclude` does not compose with the config's own list).
 */
export const APP_TESTS = ["packages/ui/**", "apps/desktop/**"];

/** Explicit, so a tree in neither list runs in BOTH scopes rather than in none. */
export const PURE_TESTS = [
  "packages/analytics/**",
  "packages/branding/**",
  "packages/catalog/**",
  "packages/connectors/**",
  "packages/credits/**",
  "packages/i18n/**",
  "packages/llm/**",
  "packages/mcp/**",
  "packages/ort/**",
  "packages/redact/**",
  "packages/schema/**",
  "packages/sync/**",
  "packages/tesseract2/**",
  "packages/updates-manifest/**",
  "apps/proxy/**",
  "apps/mcp-broker/**",
  "scripts/**",
];

/** Excluded under `--no-isolate` only: they mutate module-level state another file reads. */
export const NO_ISOLATE_UNSAFE_TESTS = [
  "packages/redact/src/documents.ocr.test.ts",
  "packages/redact/src/documents.pdfbuf.test.ts",
  "packages/redact/src/ocr/ocr.test.ts",
];

/** Scope-driven exclusion: VITEST_SCOPE=pure drops the app trees, =apps drops the pure ones. */
export function scopeExclude(env: NodeJS.ProcessEnv): string[] {
  const out: string[] = [];
  if (env.VITEST_SCOPE === "pure") out.push(...APP_TESTS);
  if (env.VITEST_SCOPE === "apps") out.push(...PURE_TESTS);
  if (env.VITEST_NO_ISOLATE) out.push(...NO_ISOLATE_UNSAFE_TESTS);
  return out;
}
