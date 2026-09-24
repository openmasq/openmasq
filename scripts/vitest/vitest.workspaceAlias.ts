import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));

/**
 * Tests resolve the workspace packages from `src`, never from `dist`.
 *
 * Apps consume the BUILT output (repo rule), but a TEST that reads `dist` tests the state
 * of the last `pnpm build`, not the code present: a cross-package change made the suite fail
 * (or worse, pass) until one rebuilt by hand — a whole class of false signals. A subpath
 * added to a `package.json` `exports` must be added HERE too (the test importing it fails
 * with "Failed to resolve", never silently).
 *
 * Consumed by `vitest.config.ts` — and by any vitest config that gets added: one table, or
 * two suites would resolve differently (rule 9).
 */
export const workspaceSrcAlias = [
  // Subpaths first (exact-match by regex, so the order only carries readability).
  { find: /^@openmasq\/redact\/remote$/, replacement: r("packages/redact/src/remote/remote.ts") },
  { find: /^@openmasq\/redact\/ner$/, replacement: r("packages/redact/src/local/ner.ts") },
  { find: /^@openmasq\/redact\/documents$/, replacement: r("packages/redact/src/documents/documents.ts") },
  { find: /^@openmasq\/redact\/documents\.browser$/, replacement: r("packages/redact/src/documents/browser.ts") },
  { find: /^@openmasq\/redact\/inplace$/, replacement: r("packages/redact/src/documents/inplace.ts") },
  { find: /^@openmasq\/redact\/pdf-redact$/, replacement: r("packages/redact/src/viewer/pdfRedact.ts") },
  { find: /^@openmasq\/redact\/image-redact$/, replacement: r("packages/redact/src/viewer/imageRedact.ts") },
  { find: /^@openmasq\/redact$/, replacement: r("packages/redact/src/index.ts") },
  { find: /^@openmasq\/llm\/wire$/, replacement: r("packages/llm/src/wire.ts") },
  { find: /^@openmasq\/llm\/pricing$/, replacement: r("packages/llm/src/pricing.ts") },
  { find: /^@openmasq\/llm$/, replacement: r("packages/llm/src/index.ts") },
  { find: /^@openmasq\/catalog\/mcp$/, replacement: r("packages/catalog/src/mcp/index.ts") },
  { find: /^@openmasq\/catalog\/models$/, replacement: r("packages/catalog/src/models/index.ts") },
  { find: /^@openmasq\/catalog\/redaction$/, replacement: r("packages/catalog/src/redaction/index.ts") },
  { find: /^@openmasq\/catalog$/, replacement: r("packages/catalog/src/index.ts") },
  { find: /^@openmasq\/mcp\/transport$/, replacement: r("packages/mcp/src/transport/index.ts") },
  { find: /^@openmasq\/mcp\/node$/, replacement: r("packages/mcp/src/node/index.ts") },
  { find: /^@openmasq\/mcp$/, replacement: r("packages/mcp/src/index.ts") },
  { find: /^@openmasq\/ui\/tooltip$/, replacement: r("packages/ui/src/components/brand/tooltipPlacement.ts") },
  { find: /^@openmasq\/ui$/, replacement: r("packages/ui/src/index.ts") },
  { find: /^@openmasq\/sync$/, replacement: r("packages/sync/src/index.ts") },
  { find: /^@openmasq\/credits$/, replacement: r("packages/credits/src/index.ts") },
  { find: /^@openmasq\/analytics$/, replacement: r("packages/analytics/src/index.ts") },
  { find: /^@openmasq\/branding$/, replacement: r("packages/branding/src/index.ts") },
  { find: /^@openmasq\/i18n$/, replacement: r("packages/i18n/src/index.ts") },
  { find: /^@openmasq\/schema$/, replacement: r("packages/schema/src/index.ts") },
  { find: /^@openmasq\/connectors$/, replacement: r("packages/connectors/src/index.ts") },
];

/** The corpus benches (recall on real documents, `pnpm test:corpus`): their own config, excluded from the unit suite. */
export const CORPUS_TESTS = [
  "packages/**/src/**/*.recall.test.ts",
  "packages/redact/src/__cases__/benchReplay.test.ts",
  "packages/redact/src/__cases__/benchFixes.test.ts",
];
