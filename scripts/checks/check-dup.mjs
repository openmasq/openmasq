#!/usr/bin/env node
// Ratcheted duplication guard (hard rule 9 / 13). Two checks, both cheap and both
// aimed at the ONE failure this repo actually keeps hitting: a fact that lives twice.
//
//   A. UNPINNED SYNC MARKER — a comment saying "keep in sync" / "MUST match" /
//      "mirror of" / "copied from" with no test named next to it. Rule 9 says a
//      shared fact is IMPORTED; when it genuinely can't be (HCL ⇄ TS, two runtimes),
//      the escape hatch is a parity TEST, never a comment. A comment cannot fail CI,
//      and it rots: this repo shipped two "MUST match apps/backend…" warnings whose
//      duplicate had already been removed — so the note no longer described reality,
//      it just invited the next reader to recreate the copy.
//
//   B. CROSS-APP REACH — a file in apps/A importing out of apps/B. The dependency
//      graph in CLAUDE.md says apps compose packages; an app reaching into a sibling
//      is how "copied from apps/web/components/ui" starts.
//
// A is ratcheted through dup-allowlist.json (frozen backlog, may only shrink — same
// contract as check:loc). B has no allowlist: move the shared thing into packages/.
//
// Run `node scripts/checks/check-dup.mjs --update` to regenerate the allowlist after an
// intentional, reviewed change.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const allowlistPath = join(here, "dup-allowlist.json");

// The phrasings that announce a second copy. Deliberately narrow: these are claims
// about ANOTHER file, not ordinary prose.
const MARKER =
  /keep (?:them |it |this )?in sync|kept in sync|keep .{0,30} in sync|MUST (?:match|agree)|mirror of|copied from|garder en sync/i;

// How far from the marker we look for the test that pins it. Small on purpose —
// the point of the convention is that the test is named ON THE SPOT.
const PIN_RADIUS = 4;
const PIN = /\.test\.tsx?|\bparity\b/i;

// Files that are themselves the pin, or that describe the rule rather than break it.
const EXEMPT = /(^|\/)(CLAUDE\.md)$|\.test\.tsx?$|^scripts\//;
const SCANNED = /\.(ts|tsx|css|md|mdx|tf|json)$/;

function tracked() {
  const out = execSync("git ls-files", { cwd: root, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  return out.split("\n").filter(Boolean);
}

function lines(file) {
  try {
    return readFileSync(join(root, file), "utf8").split("\n");
  } catch {
    return [];
  }
}

// ---- A. unpinned sync markers -------------------------------------------------

function unpinnedMarkers(files) {
  const hits = [];
  for (const f of files) {
    if (!SCANNED.test(f) || EXEMPT.test(f)) continue;
    const ls = lines(f);
    for (let i = 0; i < ls.length; i++) {
      if (!MARKER.test(ls[i])) continue;
      const near = ls.slice(Math.max(0, i - PIN_RADIUS), i + PIN_RADIUS + 1).join("\n");
      if (PIN.test(near)) continue; // a test is named right there → pinned
      hits.push({ file: f, line: i + 1, text: ls[i].trim().slice(0, 110) });
    }
  }
  return hits;
}

// ---- B. cross-app reach -------------------------------------------------------

const IMPORT = /(?:^|\s)(?:import|export)[^'"]*?from\s*["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/g;

function crossAppImports(files) {
  const hits = [];
  for (const f of files) {
    const m = /^apps\/([^/]+)\//.exec(f);
    if (!m || !/\.(ts|tsx|js|jsx|mjs)$/.test(f)) continue;
    const self = m[1];
    const src = lines(f).join("\n");
    for (const g of src.matchAll(IMPORT)) {
      const spec = g[1] ?? g[2];
      if (!spec || !spec.startsWith(".")) continue;
      // Resolve the relative specifier against the importer's directory.
      const resolved = join(dirname(f), spec).replace(/\\/g, "/");
      const other = /^apps\/([^/]+)\//.exec(resolved);
      if (other && other[1] !== self) {
        hits.push({ file: f, spec, reaches: other[1] });
      }
    }
  }
  return hits;
}

// ---- run ----------------------------------------------------------------------

const files = tracked();
const markers = unpinnedMarkers(files);
const cross = crossAppImports(files);

// ⚠️ The allowlist key is the file + the marker TEXT, never the line number. Keyed on the
// line, every edit ABOVE a frozen marker shifted it and the gate cried "new marker" about
// code nobody touched — a gate that false-alarms gets switched off, which costs more than
// the drift it was catching. Whitespace is collapsed so a re-wrap doesn't count as new.
const key = (h) => `${h.file}::${h.text.replace(/\s+/g, " ").trim()}`;

if (process.argv.includes("--update")) {
  const map = {};
  for (const h of markers) map[key(h)] = h.text;
  writeFileSync(allowlistPath, JSON.stringify(map, null, 2) + "\n");
  console.log(`Wrote ${markers.length} known-debt marker(s) to dup-allowlist.json`);
  process.exit(0);
}

const allow = existsSync(allowlistPath) ? JSON.parse(readFileSync(allowlistPath, "utf8")) : {};
const fresh = markers.filter((h) => !(key(h) in allow));
const gone = Object.keys(allow).filter((k) => !markers.some((h) => key(h) === k));

let failed = false;

if (cross.length) {
  failed = true;
  console.error(`\n✗ ${cross.length} cross-app import(s) — an app must not reach into a sibling:`);
  for (const h of cross) console.error(`    ${h.file}  →  ${h.spec}  (apps/${h.reaches})`);
  console.error(`\n  Move the shared code into packages/ and import it from both (CLAUDE.md rule 9).\n`);
}

if (fresh.length) {
  failed = true;
  console.error(`\n✗ ${fresh.length} NEW "keep in sync" marker(s) with no test named beside them:`);
  for (const h of fresh) console.error(`    ${h.file}:${h.line}  ${h.text}`);
  console.error(
    `\n  A comment cannot fail CI, so it is not a safeguard (CLAUDE.md rule 9/13).\n` +
      `  Either single-source the fact and delete the comment, or add a parity TEST and\n` +
      `  NAME it within ${PIN_RADIUS} lines of the marker (e.g. "pinned by foo.parity.test.ts").\n` +
      `  Regenerating the allowlist with --update only freezes debt — say why in the commit.\n`,
  );
}

if (gone.length) {
  console.log(`\n✓ ${gone.length} marker(s) resolved — drop them from the allowlist (run --update):`);
  for (const k of gone.slice(0, 8)) console.log(`    ${k}`);
  if (gone.length > 8) console.log(`    …and ${gone.length - 8} more`);
}

if (failed) process.exit(1);

console.log(
  `\n✓ No cross-app imports. Unpinned sync markers: ${markers.length} (frozen backlog; pin or delete when you touch one).`,
);
process.exit(0);
