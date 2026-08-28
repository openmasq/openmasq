import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

/**
 * Les tests résolvent les packages workspace depuis `src`, jamais depuis `dist`.
 *
 * Les apps consomment le BUILT output (règle du repo), mais un TEST qui lit `dist`
 * teste l'état du dernier `pnpm build`, pas le code présent : un changement
 * cross-package faisait échouer (ou pire, passer) la suite tant qu'on n'avait pas
 * rebuildé à la main — une classe entière de faux signaux. Un subpath ajouté à un
 * `package.json` `exports` doit être ajouté ICI aussi (le test qui l'importe échoue
 * en « Failed to resolve », jamais en silence).
 *
 * Consommé par `vitest.config.ts` — et par toute config vitest qui s'ajouterait :
 * une seule table, ou deux suites résoudraient différemment (règle 9).
 */
export const workspaceSrcAlias = [
  // Subpaths d'abord (exact-match par regex, donc l'ordre ne porte que la lisibilité).
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
  { find: /^@openmasq\/mcp$/, replacement: r("packages/mcp/src/index.ts") },
  { find: /^@openmasq\/ui$/, replacement: r("packages/ui/src/index.ts") },
  { find: /^@openmasq\/sync$/, replacement: r("packages/sync/src/index.ts") },
  { find: /^@openmasq\/credits$/, replacement: r("packages/credits/src/index.ts") },
  { find: /^@openmasq\/analytics$/, replacement: r("packages/analytics/src/index.ts") },
  { find: /^@openmasq\/branding$/, replacement: r("packages/branding/src/index.ts") },
  { find: /^@openmasq\/i18n$/, replacement: r("packages/i18n/src/index.ts") },
  { find: /^@openmasq\/schema$/, replacement: r("packages/schema/src/index.ts") },
  { find: /^@openmasq\/connectors$/, replacement: r("packages/connectors/src/index.ts") },
  { find: /^@openmasq\/emails$/, replacement: r("packages/emails/index.ts") },
];

/**
 * Les BANCS corpus (rappel/précision sur documents réels) vivaient ici — ils ont
 * quitté ce dépôt (corpus et bancs restent privés). La liste
 * survit vide parce que `vitest.config.ts` l'étale dans son `exclude` : un banc qui
 * reviendrait un jour se déclare ICI, jamais dans la suite unitaire (son timeout sous
 * charge n'est pas celui d'un test).
 */
export const CORPUS_TESTS: string[] = [];

/**
 * Les fichiers INCOMPATIBLES avec `--no-isolate` (la voie rapide `pnpm test:redact`) :
 * ils bouchonnent un module par `vi.mock` que d'autres fichiers importent EN VRAI, et
 * sans isolation le registre de modules est partagé par worker — le premier import
 * gagne, l'ordre des fichiers décide qui voit quoi (mesuré : `documents.pdfbuf` rate
 * 1 run mélangé sur 6). La voie rapide les exclut (via `VITEST_NO_ISOLATE`) ; ils
 * tournent normalement, isolés, dans `pnpm test`. Un nouveau `vi.mock(` dans
 * `packages/redact` s'ajoute ICI, ou la voie rapide devient un générateur de faux
 * rouges dépendants de l'ordre.
 */
export const NO_ISOLATE_UNSAFE_TESTS = [
  "packages/redact/src/documents.ocr.test.ts",
  "packages/redact/src/documents.pdfbuf.test.ts",
  "packages/redact/src/ocr/ocr.test.ts",
];
