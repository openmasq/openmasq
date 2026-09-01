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

// No exception. The installed-base migration that used to name the old prefix is gone:
// nothing in the tree may read, write or mention a retired name any more.
const ALLOWED = new Set();

// Never written in the clear: this guard scans its own file too, and the literal pattern
// would be its only "occurrence" — it would fail itself. FIVE retired names: the
// repository's two codenames, and the brand name abandoned before OpenMasq. The last one
// has NO exception: it never reached a user's disk, so nothing must read it back (unlike
// the first two, cf. `ALLOWED`).
const NEEDLES = [
  ["proxy", "chat"].join(""),
  ["kav", "iar"].join(""),
  ["openr", "edact"].join(""),
  // The retired product vocabulary (a verb family, every conjugation): the stem alone.
  ["cav", "iar"].join(""),
]
// The retired CSS/identifier PREFIX. A prefix is a token, not a substring: bounded on the
// left and text-only, or a random id in a fixture and a PNG byte run would both trip it.
const PREFIX_NEEDLE = "(^|[^A-Za-z0-9_])" + ["kv", "-"].join("");;

let out = "";
try {
  out += execFileSync("git", ["grep", "-I", "-i", "-n", "-E", "--full-name", PREFIX_NEEDLE, "--", ".", ":!pnpm-lock.yaml", ":!vendor"], { encoding: "utf8" });
} catch (err) {
  if (!(err.status === 1 && !err.stdout?.length)) { if (err.stdout) out += err.stdout.toString(); else throw err; }
}
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
// Commit MESSAGES too — history is published with the tree, and a message is the one
// place `git grep` never looks.
try {
  const log = execFileSync("git", ["log", "--all", "--format=%h %B"], { encoding: "utf8" });
  for (const line of log.split("\n"))
    for (const needle of [...NEEDLES, ["kv", "-"].join("")])
      if (line.toLowerCase().includes(needle)) out += `commit-message:${line}\n`;
} catch { /* not a git checkout (tarball): the tree scan above is all there is */ }
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
