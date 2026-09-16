#!/usr/bin/env node
// Rule 13: FEATURES.md (the index) + features/*.md (one file per section) describe the real
// product. Anchors come from what the product already single-sources — STRUCTURE (ids,
// order) in code, COPY in @openmasq/i18n (French is the source language) — so both are read.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const DOC = "FEATURES.md";
const SECTIONS_DIR = "features";

const errors = [];
const fail = (msg) => errors.push(msg);
const read = (p) => readFileSync(join(root, p), "utf8");
const matchAll = (src, re, group = 1) => [...src.matchAll(re)].map((m) => m[group]);

if (!existsSync(join(root, DOC))) {
  console.error(`\n✗ ${DOC} is missing — it is the master file (rule 13).\n`);
  process.exit(1);
}
const index = read(DOC);

// Index ⇄ section files: every file linked, every link a file.
const sectionFiles = existsSync(join(root, SECTIONS_DIR))
  ? readdirSync(join(root, SECTIONS_DIR)).filter((f) => f.endsWith(".md")).sort()
  : [];
const linked = new Set(matchAll(index, /\]\((features\/[^)\s]+\.md)\)/g).map((p) => p.slice(SECTIONS_DIR.length + 1)));
for (const f of sectionFiles) if (!linked.has(f)) fail(`${SECTIONS_DIR}/${f} exists but ${DOC} does not link it`);
for (const f of linked) if (!sectionFiles.includes(f)) fail(`${DOC} links ${SECTIONS_DIR}/${f}, which does not exist`);
const sections = sectionFiles.map((f) => ({ file: `${SECTIONS_DIR}/${f}`, text: read(`${SECTIONS_DIR}/${f}`) }));
const whole = [index, ...sections.map((s) => s.text)].join("\n");

// Anchors: sections, settings tabs, settings, screens, modals.
const anchors = [];
const anchor = (kind, value, origin) => anchors.push({ kind, value, origin });

const helpSections = read("packages/ui/src/help/sections.ts");
const settingsIndex = read("packages/ui/src/pages/Settings/settingsIndex.ts");
const frSections = read("packages/i18n/src/fr/sections.ts");
const frSettings = read("packages/i18n/src/fr/settings.ts");
const settingsTabsCopy = frSettings.slice(frSettings.indexOf("  tabs: {"), frSettings.indexOf("  entries: {"));
const settingsEntriesCopy = frSettings.slice(frSettings.indexOf("  entries: {"));

for (const label of matchAll(frSections, /^\s{4}label: "([^"]+)"/gm))
  anchor("section", label, "packages/i18n/src/fr/sections.ts");
for (const label of matchAll(settingsTabsCopy, /^\s{6}label: "([^"]+)"/gm))
  anchor("settings tab", label, "packages/i18n/src/fr/settings.ts");
for (const label of matchAll(settingsEntriesCopy, /^\s{6}label: "([^"]+)"/gm))
  anchor("setting", label, "packages/i18n/src/fr/settings.ts");

// A source that yields ZERO anchors means THIS script's pattern is stale, not the doc:
// say so instead of reporting a silent count change.
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

for (const d of readdirSync(join(root, "packages/ui/src/pages"), { withFileTypes: true }))
  if (d.isDirectory()) anchor("screen", d.name, "packages/ui/src/pages/");

const MODAL_INFRA = new Set(["ModalShell", "ModalTitle", "index", "providerKeyHelp"]);
for (const d of readdirSync(join(root, "packages/ui/src/containers/modals"), { withFileTypes: true })) {
  const name = d.name.replace(/\.tsx?$/, "");
  if (MODAL_INFRA.has(name) || name.includes(".test")) continue;
  anchor("modale", name, "packages/ui/src/containers/modals/");
}
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
  if (!whole.includes(a.value)) fail(`${a.kind} « ${a.value} » exists (${a.origin}) but is not in ${DOC} nor ${SECTIONS_DIR}/`);

// Cited paths must exist.
const PATHISH = /^(apps|packages|scripts|features|e2e|\.github)\//;
for (const { file, text } of [{ file: DOC, text: index }, ...sections])
  for (const tok of matchAll(text, /`([^`\n]+)`/g)) {
    if (!PATHISH.test(tok) || /[*?$<>|"'\\ {}]/.test(tok) || tok.includes("...")) continue;
    if (!existsSync(join(root, tok))) fail(`${file} cites \`${tok}\` — that path no longer exists`);
  }

// Counters are written `<!-- n:key -->42` in the index, hence verifiable to the line.
const counters = {
  sections: () => matchAll(helpSections, /\bid: "[a-z]+"/g).length,
  "onglets-reglages": () =>
    matchAll(
      settingsIndex.slice(settingsIndex.indexOf("const TAB_ORDER"), settingsIndex.indexOf("as const satisfies")),
      /^\s{2}"/gm,
    ).length,
  ecrans: () =>
    readdirSync(join(root, "packages/ui/src/pages"), { withFileTypes: true }).filter((d) => d.isDirectory()).length,
  "categories-redaction": () =>
    matchAll(read("packages/catalog/src/redaction/categories.data.ts"), /^\s{2}\{ key: "|^\s{4}key: "/gm).length,
};
for (const [key, compute] of Object.entries(counters)) {
  const m = new RegExp(`<!-- n:${key} -->(\\d+)`).exec(index);
  if (!m) {
    fail(`${DOC} does not announce the counter \`<!-- n:${key} -->\` (real value: ${compute()})`);
    continue;
  }
  const real = compute();
  if (Number(m[1]) !== real) fail(`${DOC} announces ${m[1]} for « ${key} », the real one is ${real}`);
}

// Every `### ` feature block: an Access line and at least one gesture.
for (const { file, text } of sections) {
  let current = null;
  let sawAccess = false;
  let sawCheck = false;
  const close = () => {
    if (!current) return;
    if (!sawAccess) fail(`${file}: « ${current} » does not state its access (an « **Access**: … » line)`);
    if (!sawCheck) fail(`${file}: « ${current} » has no checklist (at least one « - [ ] » line)`);
  };
  for (const line of text.split("\n")) {
    if (line.startsWith("### ")) {
      close();
      current = line.slice(4).trim();
      sawAccess = false;
      sawCheck = false;
      continue;
    }
    if (line.startsWith("## ")) {
      close();
      current = null;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("**Access**:")) sawAccess = true;
    if (/^\s*- \[[ x]\] /.test(line)) sawCheck = true;
  }
  close();
}

if (errors.length) {
  console.error(`\n✗ ${DOC} has drifted from reality (${errors.length}):\n`);
  for (const e of errors) console.error(`    ${e}`);
  console.error(
    `\n  ${DOC} + ${SECTIONS_DIR}/ are the MASTER file: what the app does and how to reach it.\n` +
      `  A feature shipped without its line is a feature nobody finds — and a line that\n` +
      `  outlives its code is worse, it promises what no longer exists.\n`,
  );
  process.exit(1);
}

console.log(`\n✓ ${DOC} + ${sections.length} sections: ${anchors.length} anchors present, paths and counters up to date.\n`);
