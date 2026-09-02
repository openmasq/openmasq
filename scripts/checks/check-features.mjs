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
const root = join(here, "../..");
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

/**
 * ⚠️ STRUCTURE and WORDS no longer live in the same file: `help/sections.ts` and
 * `Settings/settingsIndex.ts` keep the ids and their ORDER, the copy moved into
 * `@openmasq/i18n` (French = the source language, and the one FEATURES.md writes). So we
 * read both — otherwise this guard counts 0 and believes there's drift.
 */
const sections = read("packages/ui/src/help/sections.ts");
const settings = read("packages/ui/src/pages/Settings/settingsIndex.ts");
const frSections = read("packages/i18n/src/fr/sections.ts");
const frSettings = read("packages/i18n/src/fr/settings.ts");
/** The two halves of the settings catalog: the TABS, then the SETTINGS themselves. */
const settingsTabsCopy = frSettings.slice(frSettings.indexOf("  tabs: {"), frSettings.indexOf("  entries: {"));
const settingsEntriesCopy = frSettings.slice(frSettings.indexOf("  entries: {"));

for (const label of matchAll(frSections, /^\s{4}label: "([^"]+)"/gm))
  anchor("section", label, "packages/i18n/src/fr/sections.ts");
for (const label of matchAll(settingsTabsCopy, /^\s{6}label: "([^"]+)"/gm))
  anchor("settings tab", label, "packages/i18n/src/fr/settings.ts");
for (const label of matchAll(settingsEntriesCopy, /^\s{6}label: "([^"]+)"/gm))
  anchor("setting", label, "packages/i18n/src/fr/settings.ts");

/**
 * A pattern that no longer matches makes this file MUTE: it would no longer say "such a
 * section is missing from the doc", it would only say the count changed — by far the
 * hardest symptom to read (measured: the i18n migration dropped it to 0 section AND tab
 * anchors, and the message talked about counters). An empty source is therefore a GUARD-RAIL
 * FAILURE, not product drift, and it must say so as such.
 */
for (const [kind, n] of [
  ["section", matchAll(frSections, /^\s{4}label: "/gm).length],
  ["settings tab", matchAll(settingsTabsCopy, /^\s{6}label: "/gm).length],
  ["setting", matchAll(settingsEntriesCopy, /^\s{6}label: "/gm).length],
])
  if (n === 0)
    fail(
      `no ${kind} found in @openmasq/i18n — this checker's PATTERN is stale, not the doc: ` +
        `fix scripts/checks/check-features.mjs before trusting any count below`,
    );

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
// A screen's OWN dialogs live beside it (`pages/**/XxxModal.tsx`, `XxxDialog.tsx`) and the
// shared confirm in `components/` — the folder above only holds the transverse family, so
// without this walk half the dialogs the app can open were never inventoried.
const walkDialogs = (dir) => {
  for (const d of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${d.name}`;
    if (d.isDirectory()) walkDialogs(rel);
    else if (/(Modal|Dialog)\.tsx$/.test(d.name)) anchor("modale", d.name.replace(/\.tsx$/, ""), rel);
  }
};
walkDialogs("packages/ui/src/pages");
walkDialogs("packages/ui/src/components");

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
  // Navigation ORDER and tab order are structure: they stay in
  // the code, and IT is the source of truth for a count.
  sections: () => matchAll(sections, /\bid: "[a-z]+"/g).length,
  "onglets-reglages": () =>
    matchAll(settings.slice(settings.indexOf("const TAB_ORDER"), settings.indexOf("as const satisfies")), /^\s{2}"/gm)
      .length,
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
