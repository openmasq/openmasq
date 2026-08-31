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

/**
 * The file's TOKENS, comments excluded — via the real parser, not the raw scanner.
 *
 * ⚠️ A bare `createScanner` loop cannot do this: a template literal with a `${…}`
 * substitution needs `reScanTemplateToken` after the closing brace, and without it the
 * next backtick opens a template that runs to EOF — swallowing the rest of the file,
 * comments included, into ONE token. The checker then reported "code changed" on a
 * purely editorial diff. Parsing gives the token boundaries for free, and correctly for
 * regexes and JSX too; leaf nodes are the tokens, and `getText()` excludes the leading
 * trivia where comments live.
 */
const tokens = (src, file) => {
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, /* setParentNodes */ true, kind);
  const out = [];
  const walk = (n) => {
    // ⚠️ JSDoc blocks come back as CHILD NODES, not as trivia: without this skip, every
    // `/** … */` we translate reads as a token change and the checker cries wolf.
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
  else if (/\.(ya?ml|toml|sh|env.*|editorconfig|npmrc)$/.test(f) || /Dockerfile|\/pre-commit$/.test(f))
    same = lines(before, HASH) === lines(after, HASH);
  else if (/\.(css|json|rs)$/.test(f)) same = lines(before, SLASH) === lines(after, SLASH);
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
