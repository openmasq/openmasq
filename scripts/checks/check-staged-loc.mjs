#!/usr/bin/env node
/**
 * The PRE-COMMIT LOC gate — on the STAGED files only, and on their STAGED content
 * (`git show :path`), never on the whole working tree.
 *
 * Why not `check:loc` as-is: several sessions work in parallel on this tree — an overrun
 * in *another* session's WIP would block this one's commit, and a gate that is red
 * permanently teaches nobody anything. Here, red = YOUR commit would push a file past the
 * cap — exactly the useful information, at the moment fixing it costs least. (CI keeps
 * `check:loc` on the full tree.)
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { inLocScope } from "./locScope.mjs";

const CAP = 300;

// The allowlist is an object { "path": lines } — the same one `check:loc` reads.
const allow = new Set(
  Object.keys(JSON.parse(readFileSync(new URL("./file-size-allowlist.json", import.meta.url), "utf8"))),
);

const staged = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACM"], {
  encoding: "utf8",
})
  .split("\n")
  .filter((f) => f && inLocScope(f) && !allow.has(f));

const over = [];
for (const f of staged) {
  let content;
  try {
    content = execFileSync("git", ["show", `:${f}`], { encoding: "utf8" });
  } catch {
    continue; // gone from the index in the meantime — nothing to measure
  }
  const lines = content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
  if (lines > CAP) over.push({ f, lines });
}

if (over.length) {
  console.error(`✗ ${over.length} STAGED file(s) above the ${CAP}-line cap (rule 1):`);
  for (const { f, lines } of over) console.error(`    ${String(lines).padStart(5)}  ${f}`);
  console.error("  Split before committing (folder + barrel), or add to the allowlist");
  console.error("  via `node scripts/checks/check-file-size.mjs --update`, saying why.");
  process.exit(1);
}
