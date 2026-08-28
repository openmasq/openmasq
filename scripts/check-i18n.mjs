#!/usr/bin/env node
// Cliquet i18n — la PORTE qui fait de « entièrement traduite » un invariant tenu par
// l'outil et non par la vigilance (même forme que `check-file-size.mjs`, root rule 1).
//
// Le problème qu'elle résout : traduire ~1 900 chaînes est un marathon, et pendant qu'on
// le court, du texte français EN DUR continue d'entrer. Sans garde, la fuite annule
// l'avancée. Le cliquet gèle le compte d'AUJOURD'HUI par fichier : rien n'échoue à
// l'instant présent, mais toute chaîne française neuve dans une zone couverte fait
// échouer, et traduire (donc RETIRER des chaînes) resserre le cliquet.
//
// Deux dents, comme le gabarit LOC :
//   1. un fichier NEUF (hors liste gelée) qui porte de la copie française échoue ;
//   2. un fichier gelé qui GROSSIT au-delà de son compte échoue.
//
// Ce que ça compte = un proxy de « copie française en dur » : les littéraux de chaîne
// portant un accent, plus les nœuds de TEXTE JSX. C'est un PROXY, pas une preuve — d'où
// le gel : on ne juge pas si une chaîne DEVRAIT être traduite, on empêche seulement leur
// NOMBRE de croître. Migrer une chaîne vers `@openmasq/i18n` la fait disparaître du
// compte ; `--update` regèle à la baisse (jamais à la hausse sans `--allow-growth`).
//
// Périmètre : la CHROME d'UI de `packages/ui/src` ET les EMAILS de `packages/emails`.
// EXCLUS et pourquoi :
//   • `**/*.test.*` — les tests ne s'affichent pas ;
//   • `evals/**` — corpus/scénarios, jamais rendus à l'utilisateur ;
//   • `agent/**`, `prompt/**` — prose destinée au MODÈLE : elle suit la langue de la
//     CONVERSATION, pas celle de l'UI (analyse d'audit) — la traduire serait un contresens ;
//   • `packages/emails/i18n/**` — c'est le CATALOGUE lui-même : sa `fr.ts` est pleine de
//     français par nature (la source), la compter serait un contresens ;
//   • `packages/emails/scripts/**` — outillage de release, pas un email envoyé.
// Les autres apps (`apps/web`, `main`) entreront dans le périmètre quand leur conversion
// commencera : élargir = ajouter un glob ici et regénérer la base.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const allowlistPath = join(here, "i18n-allowlist.json");

const ACCENT = /[àâäçéèêëîïôöùûüœÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŒ]/;

/** Zones EXCLUES du périmètre (voir l'en-tête). */
const EXCLUDE = [
  /\.(test|spec)\.tsx?$/,
  /\/evals\//,
  /\/agent\//,
  /\/prompt\//,
  /^packages\/emails\/i18n\//,
  /^packages\/emails\/scripts\//,
];

function coveredFiles() {
  const out = execSync(
    "git ls-files 'packages/ui/src/**/*.ts' 'packages/ui/src/**/*.tsx' " +
      "'packages/emails/**/*.ts' 'packages/emails/**/*.tsx'",
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split("\n").filter((f) => f && !EXCLUDE.some((re) => re.test(f)));
}

/** Un PROXY de « chaînes de copie française en dur » dans un fichier. Retire commentaires
 *  de ligne et de bloc, puis compte les littéraux accentués + les textes JSX nus. */
function frenchCopyCount(file) {
  let src;
  try {
    src = readFileSync(join(root, file), "utf8");
  } catch {
    return 0;
  }
  let inBlock = false;
  let n = 0;
  for (const raw of src.split("\n")) {
    let line = raw;
    if (inBlock) {
      const e = line.indexOf("*/");
      if (e < 0) continue;
      line = line.slice(e + 2);
      inBlock = false;
    }
    const b = line.indexOf("/*");
    if (b >= 0) {
      const e = line.indexOf("*/", b + 2);
      if (e < 0) {
        inBlock = true;
        line = line.slice(0, b);
      } else {
        line = line.slice(0, b) + line.slice(e + 2);
      }
    }
    const c = line.indexOf("//");
    if (c >= 0 && !/https?:$/.test(line.slice(0, c))) line = line.slice(0, c);
    for (const lit of line.match(/'[^']{4,}'|"[^"]{4,}"|`[^`]{4,}`/g) ?? []) if (ACCENT.test(lit)) n++;
    for (const jsx of line.match(/>[^<>{}]{3,}</g) ?? []) if (/[A-Za-zÀ-ÿ]{3,}/.test(jsx)) n++;
  }
  return n;
}

const files = coveredFiles();
const counts = new Map(files.map((f) => [f, frenchCopyCount(f)]));
const withCopy = files.filter((f) => counts.get(f) > 0).sort((a, b) => counts.get(b) - counts.get(a));
const allow = existsSync(allowlistPath) ? JSON.parse(readFileSync(allowlistPath, "utf8")) : {};

if (process.argv.includes("--update")) {
  const allowGrowth = process.argv.includes("--allow-growth");
  const raised = withCopy.filter((f) => f in allow && counts.get(f) > allow[f]);
  if (raised.length && !allowGrowth) {
    console.error(`\n✗ --update RELÈVERAIT le compte gelé de ${raised.length} fichier(s) :`);
    for (const f of raised) console.error(`    ${allow[f]} → ${counts.get(f)}  (+${counts.get(f) - allow[f]})  ${f}`);
    console.error(
      `\n  La liste est un backlog, pas une dispense : elle baisse librement, mais\n` +
        `  l'aggraver est un acte délibéré. Migrez la copie vers @openmasq/i18n, ou\n` +
        `  relancez avec --allow-growth en le justifiant dans le commit.\n`,
    );
    process.exit(1);
  }
  const map = Object.fromEntries(withCopy.map((f) => [f, counts.get(f)]));
  writeFileSync(allowlistPath, JSON.stringify(map, null, 2) + "\n");
  console.log(`Écrit ${withCopy.length} entrées de dette i18n dans i18n-allowlist.json`);
  process.exit(0);
}

// DENT 1 — un fichier neuf porteur de copie française qui n'est pas dans la liste gelée.
const fresh = withCopy.filter((f) => !(f in allow));
// DENT 2 — un fichier gelé qui a grossi au-delà de son compte.
const grown = withCopy
  .filter((f) => f in allow && counts.get(f) > allow[f])
  .sort((a, b) => counts.get(b) - allow[b] - (counts.get(a) - allow[a]));
const cleared = Object.keys(allow).filter((f) => !withCopy.includes(f));
const shrunk = withCopy.filter((f) => f in allow && counts.get(f) < allow[f]);

if (cleared.length) {
  console.log(`\n✓ ${cleared.length} fichier(s) entièrement traduits — retirez-les (--update) :`);
  console.log(`  ${cleared.slice(0, 8).join(", ")}${cleared.length > 8 ? "…" : ""}`);
}
if (shrunk.length) {
  console.log(`\n✓ ${shrunk.length} fichier(s) ont perdu de la copie en dur — --update resserre le cliquet.`);
}

if (fresh.length) {
  console.error(`\n✗ ${fresh.length} fichier(s) NEUF(S) portent de la copie française en dur (i18n) :`);
  for (const f of fresh) console.error(`    ${counts.get(f)}  ${f}`);
  console.error(
    `\n  Passez la copie par le catalogue typé : \`useT()\` dans un composant, un traducteur\n` +
      `  passé en argument dans un module .ts (@openmasq/i18n). Voir packages/i18n/CLAUDE.md.\n`,
  );
}

if (grown.length) {
  console.error(`\n✗ ${grown.length} fichier(s) à dette gelée ont GROSSI en copie française (i18n) :`);
  for (const f of grown) console.error(`    ${allow[f]} → ${counts.get(f)}  (+${counts.get(f) - allow[f]})  ${f}`);
  console.error(
    `\n  Le cliquet gèle ces fichiers pour que la dette ne fasse que baisser. Ajouter\n` +
      `  une chaîne en dur ici l'aggrave. Migrez-la vers @openmasq/i18n ; croissance\n` +
      `  délibérée : --update --allow-growth, avec la raison dans le commit.\n`,
  );
}

if (fresh.length || grown.length) process.exit(1);

console.log(`\n✓ Aucune nouvelle copie française en dur ; ${withCopy.length} fichier(s) gelé(s), sans croissance.`);
process.exit(0);
