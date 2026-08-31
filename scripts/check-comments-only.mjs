#!/usr/bin/env node
// Proves a diff touches NOTHING but comments.
//
// Translating 21,000 comment lines is mechanical, but one displaced brace would go
// unnoticed in a review that size — and these comments carry the security rationale
// (rule 7), so the batch has to be VERIFIABLE, not merely read. The principle:
// re-tokenise BEFORE and AFTER with the TypeScript scanner (it skips trivia, comments
// included, and knows string literals, templates and regexes) and require the SAME
// token sequence. For CSS/YAML, compare the non-comment lines instead.
//
//   node scripts/check-comments-only.mjs [<ref>]     (default: HEAD)
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const ref = process.argv[2] ?? "HEAD";
const changed = execSync(`git diff --name-only ${ref}`, { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const tokens = (src, file) => {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, /* skipTrivia */ true, ts.LanguageVariant.JSX, src);
  const out = [];
  for (;;) {
    const k = scanner.scan();
    if (k === ts.SyntaxKind.EndOfFileToken) break;
    // JSX text carries the visible copy; keep it — a change there is NOT a comment.
    out.push(`${k}:${scanner.getTokenText()}`);
    if (out.length > 400000) throw new Error(`${file}: too many tokens`);
  }
  return out.join("\n");
};

const lines = (src, isComment) =>
  src.split("\n").filter((l) => !isComment(l.trim())).join("\n");

const HASH = (l) => l.startsWith("#");
const CSS = (l) => l.startsWith("/*") || l.startsWith("*") || l.startsWith("//");

let bad = 0;
let ok = 0;
for (const f of changed) {
  let before;
  try {
    before = execSync(`git show ${ref}:${f}`, { encoding: "utf8", maxBuffer: 1 << 28 });
  } catch {
    console.log(`  NEW  ${f} (new file — outside the "comments only" contract)`);
    bad++;
    continue;
  }
  let after;
  try {
    after = readFileSync(f, "utf8");
  } catch {
    console.log(`  DEL  ${f}`);
    bad++;
    continue;
  }
  let same;
  if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(f)) same = tokens(before, f) === tokens(after, f);
  else if (/\.(ya?ml|toml|sh|env.*)$/.test(f) || /Dockerfile/.test(f)) same = lines(before, HASH) === lines(after, HASH);
  else if (/\.css$/.test(f)) same = lines(before, CSS) === lines(after, CSS);
  else same = before === after;
  if (same) ok++;
  else {
    console.log(`  ✗ ${f} — CODE changed, not just comments`);
    bad++;
  }
}
if (bad) {
  console.error(`\n✗ ${bad} file(s) break the contract, ${ok} conform.`);
  process.exit(1);
}
console.log(`\n✓ ${ok} file(s): comments only.`);
