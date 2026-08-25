#!/usr/bin/env node
// The workspace-package → SOURCE resolution table exists in two runtimes that cannot
// import each other:
//
//   • `scripts/vitest.workspaceAlias.ts` — a TS module, imported by vitest AND by
//     `apps/desktop/electron.vite.config.ts` (dev-serve). One object, no copy.
//   • `apps/desktop/tsconfig.json` `paths` — JSON, read by `tsc`. It CANNOT import the
//     module above, so it is a genuine second copy.
//
// Rule 9: a copy that cannot be removed gets a parity TEST that reads BOTH, because a
// comment cannot fail CI. The drift this catches is silent and nasty — a package
// resolving to `src` for the tests and `dist` for the typecheck means a red typecheck
// nobody can reproduce from a test run, or worse, a green one that shouldn't be.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, posix } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/** Parse the `{ find: /^…$/, replacement: r("…") }` entries out of the TS module. */
function fromAliasModule() {
  const src = readFileSync(join(here, "vitest.workspaceAlias.ts"), "utf8");
  const out = new Map();
  for (const m of src.matchAll(/find:\s*\/\^(.+?)\$\/,\s*replacement:\s*r\("([^"]+)"\)/g)) {
    // Un-escape the regex source (`\/` → `/`, `\.` → `.`) back to the plain specifier.
    out.set(m[1].replace(/\\(.)/g, "$1"), m[2]);
  }
  return out;
}

/** Parse the `@openmasq/*` entries out of the desktop tsconfig's `paths`. */
function fromTsconfig() {
  const raw = readFileSync(join(root, "apps/desktop/tsconfig.json"), "utf8");
  // Strip // comments (tsconfig allows them, JSON.parse does not) without touching
  // the `://` of any URL that might appear in one.
  const json = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ""));
  const paths = json.compilerOptions?.paths ?? {};
  const out = new Map();
  for (const [spec, targets] of Object.entries(paths)) {
    if (!spec.startsWith("@openmasq/")) continue;
    // tsconfig paths are relative to apps/desktop; normalise to repo-root-relative.
    out.set(spec, posix.normalize(posix.join("apps/desktop", targets[0])));
  }
  return out;
}

const alias = fromAliasModule();
const ts = fromTsconfig();
const problems = [];

for (const [spec, target] of alias) {
  if (!ts.has(spec)) {
    problems.push(`missing from apps/desktop/tsconfig.json paths: "${spec}" → ${target}`);
  } else if (ts.get(spec) !== target) {
    problems.push(`target differs for "${spec}": alias → ${target}, tsconfig → ${ts.get(spec)}`);
  }
}
for (const spec of ts.keys()) {
  if (!alias.has(spec)) {
    problems.push(`missing from scripts/vitest.workspaceAlias.ts: "${spec}"`);
  }
}

if (problems.length) {
  console.error(`\n✗ Workspace source-alias tables have drifted (${problems.length}):`);
  for (const p of problems) console.error(`    ${p}`);
  console.error(
    `\n  Both must map the same specifiers to the same source entry, or a package resolves\n` +
      `  to src in one tool and dist in another. Add a new package's \`exports\` subpath to\n` +
      `  BOTH scripts/vitest.workspaceAlias.ts and apps/desktop/tsconfig.json \`paths\`.\n`,
  );
  process.exit(1);
}

console.log(`\n✓ Workspace source-alias tables agree (${alias.size} specifiers).`);
process.exit(0);
