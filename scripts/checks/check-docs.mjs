#!/usr/bin/env node
// Doc-drift guard (hard rule 5: "a stale doc is a bug" — enforced, not just asked).
//
// Every CLAUDE.md points at real code. This asserts that every repo path a doc names in
// `backticks` STILL EXISTS, so a rename/move/delete that forgets its doc fails CI instead
// of quietly turning the map into fiction. It is the cheapest half of rule 5: it cannot
// tell you a SENTENCE went stale, but it catches the single most common drift — a path
// that no longer exists — which is also the one that most misleads a reader.
//
// It also ratchets SIZE: a CLAUDE.md is loaded into context wholesale, so an oversized one
// crowds out the code it describes and stops being read. Known offenders are frozen in
// claude-md-allowlist.json — a shrinking backlog, same contract as check-file-size.mjs.
//
// Run `node scripts/checks/check-docs.mjs --update` to re-freeze the size allowlist after an
// intentional, reviewed split.
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

/** Anthropic's documented target for a memory file: "Longer files consume more context
 *  and reduce adherence." (code.claude.com/docs/en/memory). A CLAUDE.md is loaded WHOLE
 *  into every session that touches its directory, so length is paid per-session and
 *  crowds out the code it describes. Detail belongs in a NESTED CLAUDE.md next to the
 *  code — those load on demand, only when Claude reads files in that folder. */
const LINE_LIMIT = 200;
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const allowlistPath = join(here, "claude-md-allowlist.json");

/** Prefixes that make a backticked token look like a path INTO this repo. `scripts/` and
 *  `e2e/` are deliberately ambiguous (repo-root AND package-local both exist), which is
 *  why `resolveToken` tries both roots rather than guessing. */
const PATHISH = /^(apps|packages|scripts|e2e|src|public|content|components|lib|app|assets|\.github)\//;
/** Build output — gitignored, absent on a clean checkout. Naming it isn't drift. */
const GENERATED = /^dist\//;

/**
 * Is this backticked token a path we can verify? Deliberately CONSERVATIVE — a false
 * positive here would make the gate untrustworthy, and an untrusted gate gets disabled.
 * Skipped: npm package names (`@openmasq/ui`), globs, URLs, shell, code, prose.
 */
function isCheckablePath(tok) {
  if (!tok.includes("/")) return false;
  if (/[*?$<>|"'`\\ {}]/.test(tok)) return false; // globs, brace-expansion, shell, code
  if (tok.includes("...")) return false; // elided path (`packages/ui/.../foo.ts`)
  if (/^(@|https?:|~|\/)/.test(tok)) return false; // scoped pkg, URL, home, absolute
  if (tok.includes("://") || tok.includes("node_modules")) return false;
  if (GENERATED.test(tok)) return false;
  return PATHISH.test(tok);
}

/**
 * Resolve a token to an on-disk path, trying every plausible base: the doc's own folder,
 * each ancestor up to the repo root, and the root itself. A nested doc naturally writes a
 * SIBLING path (`components/message/MessageBubble.tsx` from `src/pages/CLAUDE.md`), and
 * `scripts/x.ts` may mean the repo's or the package's — guessing one base would fire on
 * correct prose. Being permissive is deliberate: this gate must only fire on a path that
 * exists NOWHERE, because a gate with false positives gets switched off, and then it
 * protects nothing.
 */
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

/**
 * Every CLAUDE.md in the repo — tracked AND not-yet-added. Untracked ones matter most:
 * a brand-new doc is exactly when a bad reference gets written, and checking only
 * `git ls-files` would green-light it until someone committed it.
 */
function docs() {
  const run = (cmd) =>
    execSync(cmd, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
      .split("\n")
      .filter(Boolean);
  const tracked = run("git ls-files '**/CLAUDE.md' 'CLAUDE.md'");
  const untracked = run("git ls-files --others --exclude-standard '**/CLAUDE.md' 'CLAUDE.md'");
  return [...new Set([...tracked, ...untracked])].sort();
}

function lines(file) {
  const t = readFileSync(join(root, file), "utf8");
  return t.length === 0 ? 0 : t.split("\n").length - (t.endsWith("\n") ? 1 : 0);
}

/** Every `backticked` token in a doc, minus fenced code blocks (those are examples). */
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
    // Trailing prose punctuation clings to a path in a sentence.
    const tok = raw.replace(/[.,;:)]+$/, "");
    if (seen.has(tok) || !isCheckablePath(tok)) continue;
    seen.add(tok);
    checked++;
    if (!resolveToken(tok, docDir)) broken.push({ doc, tok, docDir });
  }
}

/**
 * ⚠️ A GITIGNORED path is DELIBERATELY absent, not broken.
 *
 * This gate used to ask only `existsSync`, so its verdict depended on the MACHINE: a
 * built `dist/` and a local `.env` made it green on a dev workstation, and red on any
 * clean runner — the `.env.local` files, the apps' `dist`. That is: red in CI,
 * permanently, forever (one day showing `CI failure` and `Release success` on the same
 * push). A gate one cannot turn green teaches nothing any more: people learn to bypass
 * it, which is exactly what had happened.
 *
 * So the right question is not "is this file there?" but "does this repository claim to
 * contain it?". A path covered by `.gitignore` is build output or a local file: naming it
 * in a doc is legitimate, and its absence teaches nothing. A reference to a TRACKED file
 * that has disappeared remains a real error. One single batched `git check-ignore`, on
 * the unresolved tokens only.
 */
if (broken.length) {
  // The SAME bases as `resolveToken`: a token can resolve through an ANCESTOR folder
  // (`public/ort/` from a deep doc = `apps/<app>/public/ort`), and asking only about the
  // root and the doc's folder would leave that case red.
  // ⚠️ Every candidate is offered WITH and WITHOUT a trailing slash. A `.gitignore`
  // pattern targeting only a FOLDER (`public/ort/`) matches an ABSENT path only if that
  // path carries the slash — git cannot guess it is a folder — and `path.join` eats it.
  // Without both forms, every ignored folder stayed red.
  const basesOf = ({ tok, docDir }) =>
    candidateBases(docDir)
      .map((dir) => relative(root, join(dir, tok)))
      .filter((rel) => rel && !rel.startsWith(".."))
      .flatMap((rel) => [rel, `${rel}/`]);
  const candidates = broken.flatMap(basesOf);
  let ignored = new Set();
  try {
    // `check-ignore` exits 1 when NOTHING is ignored — a normal case, not a failure.
    const res = spawnSync("git", ["check-ignore", "--stdin"], {
      cwd: root,
      input: candidates.join("\n"),
      encoding: "utf8",
    });
    ignored = new Set((res.stdout || "").split("\n").filter(Boolean));
  } catch {
    ignored = new Set(); // git unavailable ⇒ nothing is excused (fail closed)
  }
  const kept = broken.filter((b) => !basesOf(b).some((rel) => ignored.has(rel)));
  broken.length = 0;
  broken.push(...kept);
}

// ── Size ratchet ───────────────────────────────────────────────────────────────
const over = all.filter((d) => lines(d) > LINE_LIMIT).sort((a, b) => lines(b) - lines(a));

if (process.argv.includes("--update")) {
  writeFileSync(
    allowlistPath,
    JSON.stringify(Object.fromEntries(over.map((d) => [d, lines(d)])), null, 2) + "\n",
  );
  console.log(`Wrote ${over.length} known-debt entries to claude-md-allowlist.json`);
  process.exit(0);
}

const allow = existsSync(allowlistPath) ? JSON.parse(readFileSync(allowlistPath, "utf8")) : {};
const freshOver = over.filter((d) => !(d in allow));
// An allowlisted doc that GREW is drifting the wrong way — the list is a backlog, not a
// licence. (check-file-size only guards new files; a doc's whole failure mode is growth.)
const grew = over.filter((d) => d in allow && lines(d) > allow[d]);
const shrunk = Object.keys(allow).filter((d) => !over.includes(d));

let failed = false;

if (broken.length) {
  failed = true;
  console.error(`\n✗ ${broken.length} CLAUDE.md reference(s) point at paths that no longer exist:`);
  for (const b of broken) console.error(`    ${b.doc}  →  ${b.tok}`);
  console.error(
    `\n  A doc that names a moved/deleted file actively misleads the next reader (rule 5).\n` +
      `  Fix the reference, or drop the sentence if the concept is gone.\n`,
  );
}

if (freshOver.length) {
  failed = true;
  console.error(`\n✗ ${freshOver.length} CLAUDE.md over the ${LINE_LIMIT}-line cap:`);
  for (const d of freshOver) console.error(`    ${lines(d)}  ${d}`);
  console.error(
    `\n  A doc this size is loaded wholesale into every session that touches the package,\n` +
      `  and stops being re-read — so it drifts. Split the detail into nested CLAUDE.md\n` +
      `  files next to the code they describe; keep this one a MAP.\n`,
  );
}

if (grew.length) {
  failed = true;
  console.error(`\n✗ ${grew.length} known-debt CLAUDE.md GREW (the backlog must shrink):`);
  for (const d of grew) console.error(`    ${allow[d]} → ${lines(d)}  ${d}`);
  console.error(`\n  Move the new detail into a nested CLAUDE.md instead of extending this one.\n`);
}

if (shrunk.length) {
  console.log(`\n✓ ${shrunk.length} doc(s) now under the cap — re-freeze with --update:`);
  console.log(`    ${shrunk.join(", ")}`);
}

if (failed) process.exit(1);

console.log(
  `\n✓ ${all.length} CLAUDE.md, ${checked} path reference(s) all resolve.` +
    (over.length ? ` Known size debt: ${over.length} (frozen; shrink when touched).` : ""),
);
process.exit(0);
