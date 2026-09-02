#!/usr/bin/env node
// CSS-family ratchet — the GATE that makes "one control, one class" an invariant held by
// the tool rather than vigilance (same shape as `check-file-size.mjs`, root rule 1).
//
// The problem it solves: the design system has ONE button (`brand/controls` `Button`,
// `IconButton`), one menu primitive (`usePopover`), one card shell, one chip — and the
// stylesheet still carries dozens of hand-rolled families that each re-declare a button
// (`.ac-btn`, `.kb-act`, `.rail-btn`…), a menu, a card or a chip. Each one is a control
// that drifts on its own (a 34px pill beside a 30px ghost square). The ratchet freezes
// TODAY's count of distinct CLASS NAMES containing `btn` / `menu` / `card` / `chip`, per
// family: nothing fails at the present moment, but a NEW class in one of these families
// makes it fail, and migrating a call site to the primitive (i.e. REMOVING a class)
// tightens the ratchet.
//
// What it counts = distinct class selectors (`.foo-btn`, `.menu-item`) across
// `packages/ui/src/styles.css` and `packages/ui/src/styles/**` — the resolved sheet, so
// peeling a family into a partial changes nothing. Comments are stripped first; a
// selector inside an at-rule (`@media`, `@keyframes`) counts like any other, since a
// class declared only under a media query is still a class someone renders.
//
// `--update` re-freezes the counts DOWNWARD; raising one needs `--allow-growth` and the
// reason in the commit — a growing allowlist is a smell, not a solution.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const allowlistPath = join(here, "css-families-allowlist.json");

/** The families — the words a hand-rolled control's class carries. */
const FAMILIES = ["btn", "menu", "card", "chip"];

/** Every .css under `packages/ui/src` (styles.css + the styles/ partials). */
function stylesheets() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".css")) out.push(p);
    }
  };
  walk(join(root, "packages/ui/src/styles"));
  out.push(join(root, "packages/ui/src/styles.css"));
  return out;
}

/** Distinct class names per family, with the file(s) each one is declared in. */
function collect() {
  const seen = new Map(FAMILIES.map((f) => [f, new Map()]));
  for (const file of stylesheets()) {
    const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    // A selector list is what precedes a `{`; declarations (`prop: value;`) never contain
    // a `.class` token that is not a number, and the `\d` guard below drops `.5px`.
    for (const block of src.split("{")) {
      const selectors = block.slice(block.lastIndexOf("}") + 1);
      for (const m of selectors.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
        const cls = m[1];
        for (const f of FAMILIES) {
          if (cls.includes(f)) seen.get(f).set(cls, relative(root, file));
        }
      }
    }
  }
  return seen;
}

const seen = collect();
const counts = Object.fromEntries(FAMILIES.map((f) => [f, seen.get(f).size]));
const allow = existsSync(allowlistPath) ? JSON.parse(readFileSync(allowlistPath, "utf8")) : {};

if (process.argv.includes("--update")) {
  const allowGrowth = process.argv.includes("--allow-growth");
  const raised = FAMILIES.filter((f) => f in allow && counts[f] > allow[f]);
  if (raised.length && !allowGrowth) {
    console.error(`\n✗ --update would RAISE the frozen count of ${raised.length} famil(y/ies):`);
    for (const f of raised) console.error(`    ${allow[f]} → ${counts[f]}  (+${counts[f] - allow[f]})  ${f}`);
    console.error(
      `\n  The allowlist is a backlog, not a waiver: it may shrink freely, but deepening\n` +
        `  the debt is a deliberate act. Render the control through brand/controls\n` +
        `  (Button / IconButton) or an existing family, or re-run with --allow-growth and\n` +
        `  state the reason in the commit message.\n`,
    );
    process.exit(1);
  }
  writeFileSync(allowlistPath, JSON.stringify(counts, null, 2) + "\n");
  console.log(`Wrote ${FAMILIES.length} frozen family counts to css-families-allowlist.json`);
  process.exit(0);
}

if (process.argv.includes("--list")) {
  for (const f of FAMILIES) {
    console.log(`\n${f} (${counts[f]}):`);
    for (const [cls, file] of [...seen.get(f)].sort()) console.log(`  .${cls}  ${file}`);
  }
  process.exit(0);
}

const grown = FAMILIES.filter((f) => f in allow && counts[f] > allow[f]);
const fresh = FAMILIES.filter((f) => !(f in allow));
const shrunk = FAMILIES.filter((f) => f in allow && counts[f] < allow[f]);

if (shrunk.length) {
  console.log(`\n✓ ${shrunk.map((f) => `${f} ${allow[f]}→${counts[f]}`).join(", ")} — run --update to tighten the ratchet.`);
}
if (fresh.length) {
  console.error(`\n✗ ${fresh.length} famil(y/ies) not frozen yet: ${fresh.join(", ")} — run --update.`);
}
if (grown.length) {
  console.error(`\n✗ ${grown.length} CSS famil(y/ies) GREW — a new hand-rolled control class:`);
  for (const f of grown) console.error(`    ${allow[f]} → ${counts[f]}  (+${counts[f] - allow[f]})  ${f}`);
  console.error(
    `\n  The design system has ONE button, menu, card and chip. Render the control through\n` +
      `  brand/controls (Button / IconButton), usePopover, AgentCard or StatusChip, or reuse\n` +
      `  the family that already exists (\`--list\` prints them). Deliberate growth:\n` +
      `  --update --allow-growth, with the reason in the commit message.\n`,
  );
}

if (fresh.length || grown.length) process.exit(1);

console.log(
  `\n✓ No new btn/menu/card/chip class: ${FAMILIES.map((f) => `${f} ${counts[f]}`).join(" · ")} (frozen).`,
);
process.exit(0);
