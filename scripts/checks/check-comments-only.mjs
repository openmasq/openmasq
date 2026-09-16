#!/usr/bin/env node
// Proves a diff touches NOTHING but comments: re-tokenise BEFORE and AFTER with the
// TypeScript parser (comments are trivia; strings, templates and regexes are known) and
// require the SAME token sequence. For CSS/YAML/JSONC, compare the non-comment lines.
// A comments-only batch carries the security rationale (rule 7) and must be VERIFIABLE.
//
//   node scripts/checks/check-comments-only.mjs [<ref>]     (default: HEAD)
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

// `--list-ok` prints the conforming paths and nothing else: in a SHARED tree where other
// sessions edit code at the same time, that list is exactly what may be staged.
const listOk = process.argv.includes("--list-ok");
const ref = process.argv.filter((a) => !a.startsWith("--"))[2] ?? "HEAD";
const changed = execSync(`git diff --name-only ${ref}`, { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

/**
 * The file's TOKENS, comments excluded — via the real parser, not the raw scanner: a bare
 * `createScanner` loop needs `reScanTemplateToken` after a `${…}` substitution or the next
 * backtick swallows the rest of the file into ONE token. Leaf nodes are the tokens, and
 * `getText()` excludes the leading trivia where comments live.
 */
const tokens = (src, file) => {
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, /* setParentNodes */ true, kind);
  const out = [];
  const walk = (n) => {
    // JSDoc blocks come back as CHILD NODES, not as trivia: skip them or every `/** … */`
    // edit reads as a token change.
    if (n.kind >= ts.SyntaxKind.FirstJSDocNode && n.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const kids = n.getChildren(sf);
    if (kids.length === 0) out.push(`${n.kind}:${n.getText(sf)}`);
    else for (const k of kids) walk(k);
  };
  for (const k of sf.getChildren(sf)) walk(k);
  return out.join("\n");
};

const lines = (src, isComment) =>
  src.split("\n").filter((l) => !isComment(l.trim())).join("\n");

const HASH = (l) => l.startsWith("#");
// JSONC (turbo.json, tsconfig.json), Rust and CSS all carry `//` or `/* … */` on their
// own lines here; the token comparison above needs a real parser, so these compare the
// non-comment LINES instead — enough, because a code change in them moves a line.
const SLASH = (l) => l.startsWith("/*") || l.startsWith("*") || l.startsWith("//") || l.startsWith("//!");

let bad = 0;
let ok = 0;
for (const f of changed) {
  let before;
  try {
    before = execSync(`git show ${ref}:${f}`, { encoding: "utf8", maxBuffer: 1 << 28 });
  } catch {
    if (!listOk) console.log(`  NEW  ${f} (new file — outside the "comments only" contract)`);
    bad++;
    continue;
  }
  let after;
  try {
    after = readFileSync(f, "utf8");
  } catch {
    if (!listOk) console.log(`  DEL  ${f}`);
    bad++;
    continue;
  }
  let same;
  if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(f)) same = tokens(before, f) === tokens(after, f);
  else if (/\.(ya?ml|toml|sh|env.*|editorconfig|npmrc)$/.test(f) || /Dockerfile|\/pre-commit$/.test(f))
    same = lines(before, HASH) === lines(after, HASH);
  else if (/\.(css|json|rs)$/.test(f)) same = lines(before, SLASH) === lines(after, SLASH);
  else same = before === after;
  if (same) {
    ok++;
    if (listOk) console.log(f);
  } else {
    if (!listOk) console.log(`  ✗ ${f} — CODE changed, not just comments`);
    bad++;
  }
}
if (listOk) process.exit(0);
if (bad) {
  console.error(`\n✗ ${bad} file(s) break the contract, ${ok} conform.`);
  process.exit(1);
}
console.log(`\n✓ ${ok} file(s): comments only.`);
