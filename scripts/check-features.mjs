#!/usr/bin/env node
// FEATURES.md drift guard — la moitié mécanique de la règle « le fichier maître est
// toujours synchronisé avec le réel ».
//
// Un inventaire de fonctionnalités écrit à la main pourrit en deux semaines : on ajoute un
// écran, on oublie la ligne. Ce gate rend l'oubli ROUGE, dans les deux sens :
//
//   1. RÉEL → DOC. Les listes que le produit tient déjà comme source unique (les sections
//      de navigation, les onglets de réglages, les réglages eux-mêmes, les dossiers
//      d'écran, les modales) sont relues ICI. Un élément qui existe et que FEATURES.md ne
//      nomme pas fait échouer. C'est le sens qui compte : il attrape la feature ajoutée
//      sans sa ligne.
//   2. DOC → RÉEL. Tout chemin cité entre backticks doit exister sur le disque (même
//      contrat que `check-docs.mjs`), et chaque compteur annoncé doit être le vrai.
//   3. FORME. Chaque fonctionnalité (`### `) porte son accès et sa checklist — sans quoi
//      « toutes les features et comment y accéder » redevient une liste de titres.
//
// Ce que ce gate NE peut pas faire : dire qu'une PHRASE a vieilli. Il tient l'inventaire,
// pas la prose. C'est pour ça que les cases de la checklist décrivent des gestes
// vérifiables à la main, pas des intentions.
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
  console.error(`\n✗ ${DOC} est absent — c'est le fichier maître (règle 13).\n`);
  process.exit(1);
}
const doc = readFileSync(docPath, "utf8");
const docLines = doc.split("\n");

// ── 1) RÉEL → DOC : les ancres que le produit tient déjà en source unique ─────────────
const read = (p) => readFileSync(join(root, p), "utf8");
const matchAll = (src, re, group = 1) => [...src.matchAll(re)].map((m) => m[group]);

const anchors = [];
const anchor = (kind, value, origin) => anchors.push({ kind, value, origin });

// Les sections de navigation (leur vocabulaire est déjà single-source).
const sections = read("packages/ui/src/help/sections.ts");
for (const label of matchAll(sections, /^\s{4}label: "([^"]+)"/gm))
  anchor("section", label, "packages/ui/src/help/sections.ts");

// Les onglets de réglages + chaque réglage indexé pour ⌘K.
const settings = read("packages/ui/src/pages/Settings/settingsIndex.ts");
for (const label of matchAll(settings, /^\s{4}label: "([^"]+)"/gm))
  anchor("onglet Réglages", label, "packages/ui/src/pages/Settings/settingsIndex.ts");
for (const label of matchAll(settings, /\{ tab: "[a-z]+", label: "([^"]+)"/g))
  anchor("réglage", label, "packages/ui/src/pages/Settings/settingsIndex.ts");

// Un écran = un dossier de `pages/`. En ajouter un sans sa ligne est l'oubli type.
for (const d of readdirSync(join(root, "packages/ui/src/pages"), { withFileTypes: true }))
  if (d.isDirectory()) anchor("écran", d.name, "packages/ui/src/pages/");

// Les modales : ce que l'app peut ouvrir par-dessus un écran. On écarte la plomberie
// (coquille, titre, barils, aides) — elle n'est pas une fonctionnalité.
const MODAL_INFRA = new Set(["ModalShell", "ModalTitle", "index", "providerKeyHelp"]);
for (const d of readdirSync(join(root, "packages/ui/src/containers/modals"), { withFileTypes: true })) {
  const name = d.name.replace(/\.tsx?$/, "");
  if (MODAL_INFRA.has(name) || name.includes(".test")) continue;
  anchor("modale", name, "packages/ui/src/containers/modals/");
}

for (const a of anchors)
  if (!doc.includes(a.value)) fail(`${a.kind} « ${a.value} » existe (${a.origin}) mais n'est pas dans ${DOC}`);

// ── 2) DOC → RÉEL : chemins cités + compteurs annoncés ───────────────────────────────
const PATHISH = /^(apps|packages|scripts|infra|e2e|\.github)\//;
for (const tok of matchAll(doc, /`([^`\n]+)`/g)) {
  if (!PATHISH.test(tok) || /[*?$<>|"'\\ {}]/.test(tok) || tok.includes("...")) continue;
  if (!existsSync(join(root, tok))) fail(`${DOC} cite \`${tok}\` — ce chemin n'existe plus`);
}

/** Les compteurs sont écrits `<!-- n:clé -->42`, donc vérifiables à la ligne près. Un
 *  nombre en prose serait invérifiable, et c'est exactement ce qui pourrit en premier. */
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
    fail(`${DOC} n'annonce pas le compteur \`<!-- n:${key} -->\` (valeur réelle : ${compute()})`);
    continue;
  }
  const real = compute();
  if (Number(m[1]) !== real) fail(`${DOC} annonce ${m[1]} pour « ${key} », le réel est ${real}`);
}

// ── 3) FORME : accès + checklist par fonctionnalité ──────────────────────────────────
let current = null;
let sawAcces = false;
let sawCheck = false;
const closeFeature = () => {
  if (!current) return;
  if (!sawAcces) fail(`« ${current} » n'indique pas son accès (ligne « **Accès** : … »)`);
  if (!sawCheck) fail(`« ${current} » n'a pas de checklist (au moins une ligne « - [ ] »)`);
};
for (const line of docLines) {
  if (line.startsWith("### ")) {
    closeFeature();
    current = line.slice(4).trim();
    sawAcces = false;
    sawCheck = false;
    continue;
  }
  if (line.startsWith("## ")) {
    closeFeature();
    current = null;
    continue;
  }
  if (!current) continue;
  if (line.startsWith("**Accès** :")) sawAcces = true;
  if (/^\s*- \[[ x]\] /.test(line)) sawCheck = true;
}
closeFeature();

if (errors.length) {
  console.error(`\n✗ ${DOC} a dérivé du réel (${errors.length}) :\n`);
  for (const e of errors) console.error(`    ${e}`);
  console.error(
    `\n  ${DOC} est le fichier MAÎTRE : il décrit ce que l'app fait et comment y accéder.\n` +
      `  Une feature livrée sans sa ligne est une feature que personne ne retrouve — et une\n` +
      `  ligne qui survit à son code est pire, elle promet ce qui n'existe plus.\n`,
  );
  process.exit(1);
}

const total = anchors.length;
console.log(`\n✓ ${DOC} : ${total} ancres présentes, chemins et compteurs à jour.\n`);
