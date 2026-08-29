#!/usr/bin/env node
// Brand VALUES have ONE home: `packages/branding/branding.json`, consumed through
// `@openmasq/branding` (`BRAND`, `brandHost`, `brandKey`…) — every runtime/wire/disk value
// (domain, deep-link scheme, storage key, header) DERIVES from it, never a literal. The
// NAME also serves as the technical namespace (npm scope, `OPENMASQ_*` env,
// `window.openmasq`) — it is no longer forbidden outside that package.
//
// What this guard forbids: the return of a RETIRED name. An occurrence is a residue (a
// copy-paste from an old branch, an import from an old scope, an env from an older naming)
// that would break silently — neither the npm scope, nor the environment variables, nor
// `window.*` carry those names any more.
import { execFileSync } from "node:child_process";

// The ONLY exceptions: migrating the installed base. An install from before the rename
// carries its data under the old name (localStorage keys, the shared pre-isolation DB
// file), and the code that ADOPTS them must name what it is looking for. Three homes, not
// one more — a new reader of the old name goes through `legacyStorage.ts`.
const ALLOWED = new Set([
  // The localStorage migration pass (copies the old prefix → the current one).
  "packages/ui/src/state/legacyStorage.ts",
  // The pre-bundle theme script: it runs BEFORE the migration, so it falls back on its own.
  "apps/desktop/src/renderer/index.html",
  // Adopting the shared pre-isolation DB: the installed base's file carries the old name.
  "apps/desktop/src/main/db/connection.ts",
]);

// Never written in the clear: this guard scans its own file too, and the literal pattern
// would be its only "occurrence" — it would fail itself. THREE retired names: the
// repository's two codenames, and the brand name abandoned before OpenMasq. The last one
// has NO exception: it never reached a user's disk, so nothing must read it back (unlike
// the first two, cf. `ALLOWED`).
const NEEDLES = [
  ["proxy", "chat"].join(""),
  ["kav", "iar"].join(""),
  ["openr", "edact"].join(""),
];

let out = "";
for (const needle of NEEDLES) {
  try {
    // Git-tracked files only: node_modules, dist and local artefacts are out of play.
    // -a: three fixtures with control bytes look binary and would escape -I.
    out += execFileSync(
      "git",
      ["grep", "-a", "-i", "-n", "--full-name", needle, "--", ".", ":!pnpm-lock.yaml"],
      { encoding: "utf8" },
    );
  } catch (err) {
    // git grep exits with code 1 when it finds NOTHING — that is success here.
    if (err.status === 1 && !err.stdout?.length) continue;
    if (err.stdout) out += err.stdout.toString();
    else throw err;
  }
}
if (!out.length) {
  console.log("check:brand — no residue of the retired names.");
  process.exit(0);
}

const offenders = out
  .split("\n")
  .filter(Boolean)
  .filter((line) => !ALLOWED.has(line.split(":", 1)[0]));

if (offenders.length) {
  console.error("A retired name must not appear any more (see NEEDLES):");
  for (const line of offenders.slice(0, 50)) console.error("  " + line);
  if (offenders.length > 50) console.error(`  … and ${offenders.length - 50} more lines`);
  process.exit(1);
}
console.log("check:brand — no residue of the retired names (outside the named exceptions).");
