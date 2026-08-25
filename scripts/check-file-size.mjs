#!/usr/bin/env node
// Ratcheted 300-LOC guard (hard rule 1). Two teeth, and the second one is the reason
// this file exists in its current shape:
//
//   1. a NEW source file over the cap fails — the debt cannot spread to new files;
//   2. an ALLOWLISTED file that GROWS past its frozen value fails — the debt cannot
//      deepen in the files that already carry it.
//
// Tooth 2 was missing until 2026-07-31, and the measurement that day is why it is here:
// of the 26 frozen entries, **23 had grown and 0 had shrunk**, for +5 548 lines the gate
// could not see. `styles.css` alone had drifted +2 144 and `store.ts` +791 — the two
// files every session pays for and the ones concurrent sessions collide in. "A backlog,
// not a waiver" was true of the rule and false of the tool; only a ratchet makes it true
// of both.
//
// `--update` regenerates the frozen list after a reviewed split. It REFUSES to raise a
// value unless `--allow-growth` is also passed: shrinking is always fine, growing is a
// deliberate act that must be visible in the commit that does it (root rule 1).
//
// Scope: git-tracked .ts/.tsx/.css under apps/ + packages/, excluding tests, .d.ts,
// DB migrations and native mobile dirs (all legitimately unbounded or generated).
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { inLocScope } from "./locScope.mjs";

const LIMIT = 300;
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const allowlistPath = join(here, "file-size-allowlist.json");

// Le glob ci-dessous ne fait que PRÉ-filtrer ; le périmètre qui fait foi est
// `scripts/locScope.mjs`, partagé avec le gate pre-commit — c'est lui qu'on applique.
function trackedSourceFiles() {
  const out = execSync(
    "git ls-files 'apps/**/*.ts' 'apps/**/*.tsx' 'apps/**/*.css' " +
      "'packages/**/*.ts' 'packages/**/*.tsx' 'packages/**/*.css'",
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split("\n").filter((f) => f && inLocScope(f));
}

function loc(file) {
  try {
    const t = readFileSync(join(root, file), "utf8");
    // Count lines the way `wc -l` does (trailing newline not counted as an extra line).
    return t.length === 0 ? 0 : t.split("\n").length - (t.endsWith("\n") ? 1 : 0);
  } catch {
    return 0;
  }
}

const files = trackedSourceFiles();
const over = files.filter((f) => loc(f) > LIMIT).sort((a, b) => loc(b) - loc(a));
const allow = existsSync(allowlistPath) ? JSON.parse(readFileSync(allowlistPath, "utf8")) : {};

if (process.argv.includes("--update")) {
  const allowGrowth = process.argv.includes("--allow-growth");
  const raised = over.filter((f) => f in allow && loc(f) > allow[f]);
  if (raised.length && !allowGrowth) {
    console.error(`\n✗ --update would RAISE the frozen value of ${raised.length} file(s):`);
    for (const f of raised) console.error(`    ${allow[f]} → ${loc(f)}  (+${loc(f) - allow[f]})  ${f}`);
    console.error(
      `\n  The allowlist is a backlog, not a waiver: it may shrink freely, but deepening\n` +
        `  the debt is a deliberate act. Split the file, or re-run with --allow-growth and\n` +
        `  state the reason in the commit message.\n`,
    );
    process.exit(1);
  }
  const map = Object.fromEntries(over.map((f) => [f, loc(f)]));
  writeFileSync(allowlistPath, JSON.stringify(map, null, 2) + "\n");
  console.log(`Wrote ${over.length} known-debt entries to file-size-allowlist.json`);
  process.exit(0);
}

// TOOTH 1 — a file over the cap that isn't on the frozen list.
const fresh = over.filter((f) => !(f in allow));
// TOOTH 2 — a frozen file that grew past the value it was frozen at.
const grown = over
  .filter((f) => f in allow && loc(f) > allow[f])
  .sort((a, b) => loc(b) - allow[b] - (loc(a) - allow[a]));
// Progress worth reporting: dropped under the cap entirely, or merely got smaller.
const cleared = Object.keys(allow).filter((f) => !over.includes(f));
const shrunk = over.filter((f) => f in allow && loc(f) < allow[f]);

if (cleared.length) {
  console.log(`\n✓ ${cleared.length} file(s) dropped under ${LIMIT} LOC — remove from the`);
  console.log(`  allowlist (run --update): ${cleared.slice(0, 8).join(", ")}${cleared.length > 8 ? "…" : ""}`);
}
if (shrunk.length) {
  console.log(`\n✓ ${shrunk.length} file(s) shrank — run --update to tighten the ratchet on them.`);
}

if (fresh.length) {
  console.error(`\n✗ ${fresh.length} NEW file(s) exceed the ${LIMIT}-LOC cap (hard rule 1) — split before commit:`);
  for (const f of fresh) console.error(`    ${loc(f)}  ${f}`);
  console.error(
    `\n  Split into a feature folder with an index.ts barrel (see CLAUDE.md rule 1/2).\n` +
      `  If a split is genuinely impossible, add the file to file-size-allowlist.json via --update\n` +
      `  and say why in the commit — a growing allowlist is a smell, not a solution.\n`,
  );
}

if (grown.length) {
  console.error(`\n✗ ${grown.length} known-debt file(s) GREW past their frozen size (hard rule 1):`);
  for (const f of grown) console.error(`    ${allow[f]} → ${loc(f)}  (+${loc(f) - allow[f]})  ${f}`);
  console.error(
    `\n  These files are already over the cap; the allowlist freezes them so the debt can\n` +
      `  only shrink. Adding to one deepens the very file the rule is trying to empty.\n` +
      `  Put the new code in a sibling module (a feature folder + barrel), or split the\n` +
      `  file as you pass through it. Deliberate growth: --update --allow-growth, with the\n` +
      `  reason in the commit message.\n`,
  );
}

if (fresh.length || grown.length) process.exit(1);

console.log(`\n✓ No new >${LIMIT}-LOC files, no growth in the ${over.length} frozen one(s).`);
process.exit(0);
