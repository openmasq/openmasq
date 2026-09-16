// A `useEffect(() => expr)` in CONCISE ARROW form returns `expr` as the cleanup. If the
// platform one day makes `expr` return something other than a function, React calls it on
// unmount and the WHOLE app lands on the ErrorBoundary — and since `lib.dom` may still
// declare `void`, typechecking cannot see it.
//
// The rule: an effect has a BLOCK BODY and returns with an explicit `return …`. The only
// exception is `() => () => …` (a pure cleanup), a function by construction.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = [
  "packages/ui/src",
  "apps/desktop/src/renderer",
];
// `useEffect(() => X` where X is neither a block `{`, nor a pure cleanup `() =>`, nor a
// `void expr` (an explicit rejection of the return — safe by construction). The trailing `\S` anchors
// the position: without it, `\s*` backs up one notch and the lookaheads test a space.
const CONCISE = /use(?:Layout|Insertion)?Effect\(\s*\(\)\s*=>\s*(?!\{)(?!\(\)\s*=>)(?!void\b)\S/;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === "out" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|jsx|mjs)$/.test(name) && !/\.test\./.test(name)) yield p;
  }
}

const hits = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (CONCISE.test(line)) hits.push(`${file}:${i + 1}  ${line.trim().slice(0, 110)}`);
    });
  }
}

if (hits.length) {
  console.error(`\n✗ ${hits.length} concise-arrow effect(s) — the implicit return becomes React's cleanup:`);
  for (const h of hits) console.error(`    ${h}`);
  console.error(
    "\n  Write a BLOCK BODY: `useEffect(() => { expr; }, deps)` — and if a return is intended" +
      "\n  (unsubscribe, cleanup), write `return …;` explicitly. The platform changes what DOM" +
      "\n  APIs return underneath the types (`scrollIntoView` → Promise): the implicit one ends" +
      "\n  up on the ErrorBoundary. Never remove this gate.\n",
  );
  process.exit(1);
}
console.log("✓ no concise-arrow effect (React's cleanup is always an explicit return)");
