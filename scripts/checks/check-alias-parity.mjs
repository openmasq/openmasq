#!/usr/bin/env node
// The workspace-package → SOURCE table lives in two runtimes that cannot import each other:
// `tsconfig.workspace.json` `paths` (read by tsc) and `scripts/vitest/vitest.workspaceAlias.ts`
// (read by vitest and the dev server). Rule 9: a copy that cannot be removed gets a parity
// test that reads both — a specifier resolving to `src` in one tool and `dist` in the other
// is a red nobody can reproduce, or a green nobody should trust.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, posix } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const TSCONFIG = "tsconfig.workspace.json";

/** The `{ find: /^…$/, replacement: r("…") }` entries of the TS module. */
function fromAliasModule() {
  const src = readFileSync(join(here, "../vitest/vitest.workspaceAlias.ts"), "utf8");
  const out = new Map();
  for (const m of src.matchAll(/find:\s*\/\^(.+?)\$\/,\s*replacement:\s*r\("([^"]+)"\)/g)) {
    out.set(m[1].replace(/\\(.)/g, "$1"), m[2]);
  }
  return out;
}

/** The `@openmasq/*` entries of the shared tsconfig `paths` (repo-relative, `//` comments allowed). */
function fromTsconfig() {
  const raw = readFileSync(join(root, TSCONFIG), "utf8");
  const json = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ""));
  const paths = json.compilerOptions?.paths ?? {};
  const out = new Map();
  for (const [spec, targets] of Object.entries(paths)) {
    if (!spec.startsWith("@openmasq/")) continue;
    out.set(spec, posix.normalize(targets[0]));
  }
  return out;
}

const alias = fromAliasModule();
const ts = fromTsconfig();
const problems = [];

for (const [spec, target] of alias) {
  if (!ts.has(spec)) {
    problems.push(`missing from ${TSCONFIG} paths: "${spec}" → ${target}`);
  } else if (ts.get(spec) !== target) {
    problems.push(`target differs for "${spec}": alias → ${target}, tsconfig → ${ts.get(spec)}`);
  }
}
for (const spec of ts.keys()) {
  if (!alias.has(spec)) {
    problems.push(`missing from scripts/vitest/vitest.workspaceAlias.ts: "${spec}"`);
  }
}

if (problems.length) {
  console.error(`\n✗ Workspace source-alias tables have drifted (${problems.length}):`);
  for (const p of problems) console.error(`    ${p}`);
  console.error(
    `\n  Both must map the same specifiers to the same source entry. A new package \`exports\`\n` +
      `  subpath goes in BOTH scripts/vitest/vitest.workspaceAlias.ts and ${TSCONFIG}.\n`,
  );
  process.exit(1);
}

console.log(`\n✓ Workspace source-alias tables agree (${alias.size} specifiers).`);
process.exit(0);
