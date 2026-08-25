#!/usr/bin/env node
// A test file that no `include` pattern matches is SILENTLY never run — and the suite
// still reports green, so the failure mode is "we thought that invariant was pinned".
// That trap was live for years and was mitigated the only way a trap can't be: by a
// WARNING, repeated in two CLAUDE.md files. This gate replaces both.
//
// It reads the `include` array out of vitest.config.ts and asserts that every tracked
// `*.test.ts(x)` file in the repo is either matched by one of those patterns, or listed
// in KNOWN_UNRUN below with a reason. No third state.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import picomatch from "picomatch";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/**
 * Test files that legitimately do NOT run under the root vitest config. Each needs a
 * reason: "it isn't run" must be a decision, never an oversight.
 */
const KNOWN_UNRUN = [
  {
    pattern: "apps/backend/src/features/*/unitTest/**",
    why: "JEST supertest STEP HELPERS — exported functions with no `it`/`describe`; vitest picks them up and fails. Run by `pnpm --filter @openmasq/backend test:e2e` through tests/e2e/scenario_*.ts.",
  },
];

function includePatterns() {
  const src = readFileSync(join(root, "vitest.config.ts"), "utf8");
  const block = /include:\s*\[([\s\S]*?)\]\s*,/.exec(src);
  if (!block) {
    console.error("✗ Could not find the `include: [...]` array in vitest.config.ts.");
    process.exit(1);
  }
  // String literals only — comments in the block are ignored by construction.
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * The extra PROJECTS the root config runs beside the `unit` one. A project brings its own
 * config (and its own runtime — `apps/updates` needs workerd, which node/jsdom cannot
 * host), so its tests are covered without appearing in the `include` array. Missing this
 * would make the gate demand a KNOWN_UNRUN entry for tests that do, in fact, run.
 * Only string entries count: an inline config object is the `unit` project itself.
 */
function projectRoots() {
  const src = readFileSync(join(root, "vitest.config.ts"), "utf8");
  const block = /projects:\s*\[([\s\S]*?)\]/.exec(src);
  if (!block) return [];
  return [...block[1].matchAll(/"([^"]+)"/g)]
    .map((m) => m[1].replace(/^\.\//, "").replace(/\/$/, ""))
    .filter(Boolean);
}

function trackedTestFiles() {
  const out = execSync("git ls-files '*.test.ts' '*.test.tsx'", {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\n").filter(Boolean);
}

const patterns = includePatterns();
const isIncluded = picomatch(patterns);
const roots = projectRoots();
const inProject = (f) => roots.some((r) => f === r || f.startsWith(`${r}/`));
const knownUnrun = KNOWN_UNRUN.map((k) => ({ ...k, match: picomatch(k.pattern) }));

const orphans = [];
for (const f of trackedTestFiles()) {
  if (isIncluded(f)) continue;
  if (inProject(f)) continue;
  if (knownUnrun.some((k) => k.match(f))) continue;
  orphans.push(f);
}

if (orphans.length) {
  console.error(`\n✗ ${orphans.length} test file(s) are never run — no vitest \`include\` pattern matches them:`);
  for (const f of orphans) console.error(`    ${f}`);
  console.error(
    `\n  A test that never runs is worse than no test: the suite reports green anyway.\n` +
      `  Either widen the include in vitest.config.ts (prefer a \`**\` glob over a whole\n` +
      `  source tree, so the next subfolder needs no edit), or — if it genuinely must not\n` +
      `  run here — add it to KNOWN_UNRUN in this script WITH the reason.\n`,
  );
  process.exit(1);
}

console.log(
  `\n✓ Every tracked test file runs (${patterns.length} include patterns, ` +
    `${roots.length} project(s): ${roots.join(", ") || "none"}, ` +
    `${KNOWN_UNRUN.length} documented exceptions).`,
);
process.exit(0);
