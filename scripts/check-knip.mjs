#!/usr/bin/env node
// Dead-code ratchet. `knip` finds files nobody imports, exports nobody reads and deps
// nobody requires — on 230k LOC it currently finds a LOT, and a gate that is red on day
// one is a gate everyone learns to skip. So this follows the same contract as
// check-file-size / check-dup: the current count per category is FROZEN in
// scripts/knip-baseline.json, and the build fails only when a category GROWS.
//
// What it buys: dead code stops accumulating. What it does not: it will not clean what is
// already there. Pay a line of backlog down by deleting, then `--update` to re-freeze —
// the baseline may only shrink.
//
//   node scripts/check-knip.mjs            # or: pnpm check:knip
//   node scripts/check-knip.mjs --update   # re-freeze after a cleanup (or a config change)
//
// Note: knip's per-category counts, not its identifier lists, are what is frozen. Swapping
// one dead export for another slips through; the point is the trend, not a proof.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const baselinePath = join(here, "knip-baseline.json");
const update = process.argv.includes("--update");

/** knip's JSON reporter emits one entry per FILE, each carrying an array per category.
 *  Sum the array lengths to get the same counts its text reporter prints. */
const CATEGORIES = [
  "files",
  "dependencies",
  "devDependencies",
  "optionalPeerDependencies",
  "unlisted",
  "binaries",
  "unresolved",
  "exports",
  "types",
  "enumMembers",
  "duplicates",
];

const run = spawnSync(
  "node",
  [join(here, "../node_modules/knip/bin/knip.js"), "--no-progress", "--no-config-hints", "--reporter", "json"],
  { cwd: join(here, ".."), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

// knip exits non-zero when it finds anything, which is the normal state here. Only a
// missing/garbled report is an infrastructure failure — fail OPEN on that, like audit:gate,
// so a tooling hiccup never blocks every PR.
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error(`\n⚠ knip produced no parseable report — skipping the ratchet.\n${(run.stderr || "").slice(0, 800)}`);
  process.exit(0);
}

const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
for (const entry of report.issues ?? []) {
  for (const c of CATEGORIES) counts[c] += (entry[c] ?? []).length;
}

if (update) {
  writeFileSync(baselinePath, `${JSON.stringify(counts, null, 2)}\n`);
  console.log(`\n✓ knip baseline re-frozen:\n${JSON.stringify(counts, null, 2)}`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
} catch {
  console.error(`\n✗ Missing scripts/knip-baseline.json — run \`pnpm check:knip --update\` once to create it.\n`);
  process.exit(1);
}

const grown = [];
const shrunk = [];
for (const c of CATEGORIES) {
  const was = baseline[c] ?? 0;
  const now = counts[c];
  if (now > was) grown.push(`${c}: ${was} → ${now} (+${now - was})`);
  else if (now < was) shrunk.push(`${c}: ${was} → ${now} (−${was - now})`);
}

if (grown.length) {
  console.error(`\n✗ Dead code grew (${grown.length} categor${grown.length === 1 ? "y" : "ies"}):`);
  for (const g of grown) console.error(`    ${g}`);
  // ⚠️ NOMMER les trouvailles, pas seulement les compter. « Run `pnpm exec knip` » est un
  // conseil inutile là où ce gate tombe : sur un runner, personne ne peut relancer knip à
  // la main, et le verdict peut dépendre de l'environnement (un fichier généré présent en
  // local, absent d'un checkout propre) — auquel cas la commande locale ne reproduit même
  // pas la panne. Un gate qui dit « +1 » sans dire QUOI envoie chercher à l'aveugle.
  const grownCats = new Set(grown.map((g) => g.split(":")[0]));
  console.error(`\n  Les trouvailles de ${[...grownCats].join(", ")} (les nouvelles sont dedans) :`);
  let shown = 0;
  for (const entry of report.issues ?? []) {
    for (const c of grownCats) {
      for (const item of entry[c] ?? []) {
        if (shown++ >= 40) continue;
        const name = typeof item === "string" ? item : (item.name ?? JSON.stringify(item));
        console.error(`    ${c.padEnd(14)} ${name}${entry.file ? `  ← ${entry.file}` : ""}`);
      }
    }
  }
  if (shown > 40) console.error(`    … et ${shown - 40} autre(s)`);
  console.error(
    `\n  Soit c'est mort et ça se supprime, soit c'est atteignable et knip ne le voit pas\n` +
      `  (import dynamique, point d'entrée de plateforme, fichier généré) — dans ce cas on\n` +
      `  l'apprend à knip.json, on ne re-gèle pas le nombre.\n`,
  );
  process.exit(1);
}

if (shrunk.length) {
  console.log(`\n✓ knip ratchet holds, and shrank:`);
  for (const s of shrunk) console.log(`    ${s}`);
  console.log(`\n  Re-freeze with \`pnpm check:knip --update\` so the gain is locked in.\n`);
  process.exit(0);
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`\n✓ knip ratchet holds (${total} known findings, none new).`);
process.exit(0);
