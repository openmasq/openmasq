#!/usr/bin/env node
// FEATURES.md drift guard — the mechanical half of the rule "the master file is always
// in step with reality".
//
// A hand-written feature inventory rots in two weeks: a screen is added, the line is
// forgotten. This gate turns that forgetting RED, in both directions:
//
//   1. REALITY → DOC. The lists the product already holds as a single source (the
//      navigation sections, the settings tabs, the settings themselves, the screen
//      folders, the modals) are re-read HERE. An item that exists and that FEATURES.md
//      does not name fails the gate. That direction is the one that matters: it catches
//      the feature added without its line.
//   2. DOC → REALITY. Every path cited in backticks must exist on disk (the same contract
//      as `check-docs.mjs`), and every announced counter must be the real one.
//   3. SHAPE. Every feature (`### `) carries its access and its checklist — without which
//      "every feature and how to reach it" is once again a list of titles.
//
// What this gate can NOT do: tell that a SENTENCE has aged. It holds the inventory, not
// the prose. That is why the checklist boxes describe gestures verifiable by hand, not
// intentions.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const DOC = "FEATURES.md";
const docPath = join(root, DOC);

const errors = [];
const fail = (msg) => errors.push(msg);

if (!existsSync(docPath)) {
  console.error(`\n✗ ${DOC} is missing — it is the master file (rule 13).\n`);
  process.exit(1);
}
const doc = readFileSync(docPath, "utf8");
const docLines = doc.split("\n");

// ── 1) REALITY → DOC: the anchors the product already single-sources ─────────────────
const read = (p) => readFileSync(join(root, p), "utf8");
const matchAll = (src, re, group = 1) => [...src.matchAll(re)].map((m) => m[group]);

const anchors = [];
const anchor = (kind, value, origin) => anchors.push({ kind, value, origin });

// The navigation sections (their vocabulary is already single-sourced).
const sections = read("packages/ui/src/help/sections.ts");
for (const label of matchAll(sections, /^\s{4}label: "([^"]+)"/gm))
  anchor("section", label, "packages/ui/src/help/sections.ts");

// The settings tabs + every setting indexed for ⌘K.
const settings = read("packages/ui/src/pages/Settings/settingsIndex.ts");
for (const label of matchAll(settings, /^\s{4}label: "([^"]+)"/gm))
  anchor("settings tab", label, "packages/ui/src/pages/Settings/settingsIndex.ts");
for (const label of matchAll(settings, /\{ tab: "[a-z]+", label: "([^"]+)"/g))
  anchor("setting", label, "packages/ui/src/pages/Settings/settingsIndex.ts");

// A screen = a folder of `pages/`. Adding one without its line is the typical miss.
for (const d of readdirSync(join(root, "packages/ui/src/pages"), { withFileTypes: true }))
  if (d.isDirectory()) anchor("screen", d.name, "packages/ui/src/pages/");

// The modals: what the app can open on top of a screen. Plumbing is excluded (shell,
// title, barrels, helpers) — it is not a feature.
const MODAL_INFRA = new Set(["ModalShell", "ModalTitle", "index", "providerKeyHelp"]);
for (const d of readdirSync(join(root, "packages/ui/src/containers/modals"), { withFileTypes: true })) {
  const name = d.name.replace(/\.tsx?$/, "");
  if (MODAL_INFRA.has(name) || name.includes(".test")) continue;
  anchor("modale", name, "packages/ui/src/containers/modals/");
}

for (const a of anchors)
  if (!doc.includes(a.value)) fail(`${a.kind} « ${a.value} » exists (${a.origin}) but is not in ${DOC}`);

// ── 2) DOC → REALITY: cited paths + announced counters ───────────────────────────────
const PATHISH = /^(apps|packages|scripts|infra|e2e|\.github)\//;
for (const tok of matchAll(doc, /`([^`\n]+)`/g)) {
  if (!PATHISH.test(tok) || /[*?$<>|"'\\ {}]/.test(tok) || tok.includes("...")) continue;
  if (!existsSync(join(root, tok))) fail(`${DOC} cites \`${tok}\` — that path no longer exists`);
}

/** Counters are written `<!-- n:key -->42`, hence verifiable to the line. A number in
 *  prose would be unverifiable, and that is exactly what rots first. */
const counters = {
  sections: () => matchAll(sections, /^\s{4}id: "/gm).length,
  "onglets-reglages": () => matchAll(settings, /^\s{4}id: "/gm).length,
  ecrans: () =>
    readdirSync(join(root, "packages/ui/src/pages"), { withFileTypes: true }).filter((d) => d.isDirectory()).length,
  "categories-redaction": () =>
    matchAll(read("packages/catalog/src/redaction/index.ts"), /^\s{2}\{ key: "/gm).length,
};
for (const [key, compute] of Object.entries(counters)) {
  const re = new RegExp(`<!-- n:${key} -->(\\d+)`);
  const m = re.exec(doc);
  if (!m) {
    fail(`${DOC} does not announce the counter \`<!-- n:${key} -->\` (real value: ${compute()})`);
    continue;
  }
  const real = compute();
  if (Number(m[1]) !== real) fail(`${DOC} announces ${m[1]} for « ${key} », the real one is ${real}`);
}

// ── 3) SHAPE: access + checklist per feature ─────────────────────────────────────────
// ⚠️ The marker is `**Access**:` — the document is in ENGLISH (public repository), only
// the interface LABELS stay French in it, because the app is. A translated marker without
// this matcher would turn the gate green on a file that states no access at all.
let current = null;
let sawAccess = false;
let sawCheck = false;
const closeFeature = () => {
  if (!current) return;
  if (!sawAccess) fail(`« ${current} » does not state its access (an « **Access**: … » line)`);
  if (!sawCheck) fail(`« ${current} » has no checklist (at least one « - [ ] » line)`);
};
for (const line of docLines) {
  if (line.startsWith("### ")) {
    closeFeature();
    current = line.slice(4).trim();
    sawAccess = false;
    sawCheck = false;
    continue;
  }
  if (line.startsWith("## ")) {
    closeFeature();
    current = null;
    continue;
  }
  if (!current) continue;
  if (line.startsWith("**Access**:")) sawAccess = true;
  if (/^\s*- \[[ x]\] /.test(line)) sawCheck = true;
}
closeFeature();

if (errors.length) {
  console.error(`\n✗ ${DOC} has drifted from reality (${errors.length}):\n`);
  for (const e of errors) console.error(`    ${e}`);
  console.error(
    `\n  ${DOC} is the MASTER file: it describes what the app does and how to reach it.\n` +
      `  A feature shipped without its line is a feature nobody finds — and a line that\n` +
      `  outlives its code is worse, it promises what no longer exists.\n`,
  );
  process.exit(1);
}

const total = anchors.length;
console.log(`\n✓ ${DOC}: ${total} anchors present, paths and counters up to date.\n`);
