// The ANTI-"destroy is not a function" gate — the class of bug it forbids:
// a `useEffect(() => expr)` in CONCISE ARROW form returns `expr` as the
// cleanup. If `expr` one day starts returning something other than a function, React
// calls it on unmount and the WHOLE app lands on the ErrorBoundary. This is not
// theoretical: Chromium changed `scrollIntoView` to return a PROMISE, and
// `useEffect(() => el.scrollIntoView(...))` — correct for months — took the app down on
// every model change. Since `lib.dom` still declares `void`, typechecking CANNOT see this
// class: the platform moves underneath the types.
//
// The rule: an effect is written with a BLOCK BODY, and what it returns is written
// `return …` — an EXPLICIT return is a reviewed choice, a concise-arrow return is an
// accident waiting to happen. The only exception: `() => () => …` (a pure cleanup, with no
// body), whose return is a function by construction.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = [
  "packages/ui/src",
  "apps/desktop/src/renderer",
  "apps/web",
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
