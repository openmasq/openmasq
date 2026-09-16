#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

/** A CLAUDE.md is loaded WHOLE into every session touching its folder, and long files reduce
 *  adherence. The root is the map (200 lines); a nested doc carries detail (110 lines). */
const ROOT_LINE_LIMIT = 200;
const NESTED_LINE_LIMIT = 110;
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const allowlistPath = join(here, "claude-md-allowlist.json");

/** Tokens that look like a path INTO this repo. `scripts/` and `e2e/` exist at the root AND
 *  inside packages, so `resolveToken` tries every base instead of guessing one. */
const PATHISH = /^(apps|packages|scripts|e2e|src|public|content|components|lib|app|assets|features|\.github)\//;
const GENERATED = /^dist\//;

/** Conservative on purpose: a false positive would get this gate switched off. */
function isCheckablePath(tok) {
  if (!tok.includes("/")) return false;
  if (/[*?$<>|"'`\\ {}]/.test(tok)) return false;
  if (tok.includes("...")) return false;
  if (/^(@|https?:|~|\/)/.test(tok)) return false;
  if (tok.includes("://") || tok.includes("node_modules")) return false;
  if (GENERATED.test(tok)) return false;
  return PATHISH.test(tok);
}

function candidateBases(docDir) {
  const bases = [];
  for (let dir = docDir; ; dir = dirname(dir)) {
    bases.push(dir);
    if (dir === root || !dir.startsWith(root)) break;
  }
  return bases;
}

function resolveToken(tok, docDir) {
  for (const dir of candidateBases(docDir)) {
    if (existsSync(join(dir, tok))) return join(dir, tok);
  }
  return null;
}

/** Tracked, untracked AND gitignored docs: the nested CLAUDE.md are gitignored (local-only),
 *  so CI only ever sees the root — this gate, run locally and by the pre-commit hook, is the
 *  one place their length and their paths are checked. */
function docs() {
  const run = (cmd) =>
    execSync(cmd, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
      .split("\n")
      .filter(Boolean);
  const tracked = run("git ls-files '**/CLAUDE.md' 'CLAUDE.md'");
  const untracked = run("git ls-files --others --exclude-standard '**/CLAUDE.md' 'CLAUDE.md'");
  const ignored = run("git ls-files --others --ignored --exclude-standard '**/CLAUDE.md'").filter(
    (f) => !f.includes("node_modules/") && !f.startsWith(".claude/"),
  );
  return [...new Set([...tracked, ...untracked, ...ignored])].sort();
}

function lines(file) {
  const t = readFileSync(join(root, file), "utf8");
  return t.length === 0 ? 0 : t.split("\n").length - (t.endsWith("\n") ? 1 : 0);
}

const limitOf = (doc) => (doc === "CLAUDE.md" ? ROOT_LINE_LIMIT : NESTED_LINE_LIMIT);

/** Every `backticked` token, minus fenced code blocks (those are examples). */
function backticked(text) {
  const noFences = text.replace(/```[\s\S]*?```/g, "");
  return [...noFences.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim());
}

const all = docs();
const broken = [];
let checked = 0;

for (const doc of all) {
  const text = readFileSync(join(root, doc), "utf8");
  const docDir = dirname(join(root, doc));
  const seen = new Set();
  for (const raw of backticked(text)) {
    const tok = raw.replace(/[.,;:)]+$/, "");
    if (seen.has(tok) || !isCheckablePath(tok)) continue;
    seen.add(tok);
    checked++;
    if (!resolveToken(tok, docDir)) broken.push({ doc, tok, docDir });
  }
}

/** A GITIGNORED path (build output, a local .env) is deliberately absent, not broken: the
 *  question is "does this repository claim to contain it?", never "is it on this machine?". */
if (broken.length) {
  const basesOf = ({ tok, docDir }) =>
    candidateBases(docDir)
      .map((dir) => relative(root, join(dir, tok)))
      .filter((rel) => rel && !rel.startsWith(".."))
      .flatMap((rel) => [rel, `${rel}/`]);
  const candidates = broken.flatMap(basesOf);
  let ignored = new Set();
  try {
    const res = spawnSync("git", ["check-ignore", "--stdin"], { cwd: root, input: candidates.join("\n"), encoding: "utf8" });
    ignored = new Set((res.stdout || "").split("\n").filter(Boolean));
  } catch {
    ignored = new Set(); // git unavailable ⇒ nothing is excused (fail closed)
  }
  const kept = broken.filter((b) => !basesOf(b).some((rel) => ignored.has(rel)));
  broken.length = 0;
  broken.push(...kept);
}

const over = all.filter((d) => lines(d) > limitOf(d)).sort((a, b) => lines(b) - lines(a));

if (process.argv.includes("--update")) {
  writeFileSync(allowlistPath, JSON.stringify(Object.fromEntries(over.map((d) => [d, lines(d)])), null, 2) + "\n");
  console.log(`Wrote ${over.length} known-debt entries to claude-md-allowlist.json`);
  process.exit(0);
}

const allow = existsSync(allowlistPath) ? JSON.parse(readFileSync(allowlistPath, "utf8")) : {};
const freshOver = over.filter((d) => !(d in allow));
const grew = over.filter((d) => d in allow && lines(d) > allow[d]);
const shrunk = Object.keys(allow).filter((d) => !over.includes(d));

let failed = false;

if (broken.length) {
  failed = true;
  console.error(`\n✗ ${broken.length} CLAUDE.md reference(s) point at paths that no longer exist:`);
  for (const b of broken) console.error(`    ${b.doc}  →  ${b.tok}`);
  console.error(`\n  A doc that names a moved/deleted file misleads the next reader (rule 5). Fix or drop the sentence.\n`);
}

if (freshOver.length) {
  failed = true;
  console.error(`\n✗ ${freshOver.length} CLAUDE.md over the cap (root ${ROOT_LINE_LIMIT}, nested ${NESTED_LINE_LIMIT} lines):`);
  for (const d of freshOver) console.error(`    ${lines(d)}  ${d}`);
  console.error(`\n  Keep the map and the invariants; cut listings, signatures and history (root CLAUDE.md, "Writing docs").\n`);
}

if (grew.length) {
  failed = true;
  console.error(`\n✗ ${grew.length} known-debt CLAUDE.md GREW (the backlog must shrink):`);
  for (const d of grew) console.error(`    ${allow[d]} → ${lines(d)}  ${d}`);
}

if (shrunk.length) {
  console.log(`\n✓ ${shrunk.length} doc(s) now under the cap — re-freeze with --update:\n    ${shrunk.join(", ")}`);
}

if (failed) process.exit(1);

console.log(
  `\n✓ ${all.length} CLAUDE.md, ${checked} path reference(s) all resolve.` +
    (over.length ? ` Known size debt: ${over.length} (frozen; shrink when touched).` : ""),
);
