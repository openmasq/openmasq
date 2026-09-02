#!/usr/bin/env node
// i18n ratchet — the GATE that makes "fully translated" an invariant held by
// the tool rather than vigilance (same shape as `check-file-size.mjs`, root rule 1).
//
// The problem it solves: translating ~1,900 strings is a marathon, and while we
// run it, hard-coded French text keeps coming in. Without a guard, the leak cancels
// out the progress. The ratchet freezes TODAY's count per file: nothing fails at
// the present moment, but any new French string in a covered zone makes it
// fail, and translating (i.e. REMOVING strings) tightens the ratchet.
//
// Two teeth, like the LOC gauge:
//   1. a NEW file (outside the frozen list) carrying French copy fails;
//   2. a frozen file that GROWS past its count fails.
//
// What this counts = a proxy for "HARD-CODED copy": a string literal sitting on a
// property someone READS (`title`, `aria-label`, `placeholder`, `label`…), a JSX
// text node, both branches of a string ternary, and a TEMPLATE literal whose text
// reads as French (an accent, a function word) — `Mise à jour ${v}` is a sentence. ⚠️ **Without looking at
// accents**: the first version only counted accented literals, so
// "Nouvelle conversation" or "Search a file" got through the gate — and hard-coded English
// is exactly the same defect as hard-coded French, in an app that has two languages.
// It's a PROXY, not a proof — hence the freeze: we don't judge whether a string SHOULD be
// translated, we only prevent their NUMBER from growing. Migrating a string to
// `@openmasq/i18n` makes it disappear from the count; `--update` re-freezes downward (never
// upward without `--allow-growth`).
//
// Scope: the UI CHROME of `packages/ui/src`, the EMAILS of `packages/emails`, and the
// shared CATALOGS (`packages/catalog/src`, `packages/llm/src`) — their readable copy has
// moved into `@openmasq/i18n`, and this is where we prevent it from coming back.
// EXCLUDED and why:
//   • `**/*.test.*` — tests are never displayed;
//   • `evals/**` — corpus/scenarios, never rendered to the user;
//   • `agent/**`, `prompt/**` — prose addressed to the MODEL: it follows the language of the
//     CONVERSATION, not the UI's (audit analysis) — translating it would be a contresens;
//   • `packages/emails/i18n/**` — this is the CATALOG itself: its `fr.ts` is full of
//     French by nature (the source), counting it would be a contresens;
//   • `packages/emails/scripts/**` — release tooling, not a sent email;
//   • `packages/catalog/src/mcp/connectors/**` — a connector's `desc` is read by the
//     MODEL (`suggest_integrations`), not just by the UI: it stays in French, frozen.
// The other apps (`apps/web`, `main`) will enter the scope when their conversion
// starts: widening = adding a glob here and regenerating the baseline.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const allowlistPath = join(here, "i18n-allowlist.json");

/** The properties whose value is READ by someone — the list is deliberately
 *  short: a technical property (`className`, `href`, `id`) has no business there. */
const READ_NAMES =
  "title|aria-label|ariaLabel|placeholder|alt|label|message|confirmLabel|cancelLabel|subtitle" +
  "|hint|tip|desc|note|sub|eyebrow|heading|caption|cta|emptyTitle|emptyBody|rowTitle|onDesc" +
  "|missingDesc|approval|short";
/** The JSX form (`title="…"`) AND the TABLE form (`desc: "…"`): both carry
 *  copy, and it's the second one that let the catalogs through for months.
 *  ⚠️ `name` is OUT of the list: a connector or model name is a PROPER noun
 *  ("Gmail", "GPT-5.5") — counting it would make noise where there's nothing to translate. */
const READ_PROPS = new RegExp(`\\b(${READ_NAMES})\\s*[=:]\\s*\\{?(["'\`])((?:(?!\\2).){3,}?)\\2`, "g");
/** A ternary whose BOTH branches are sentences — the pattern of a toggled label. */
const TERNARY = /\?\s*"([^"]{4,})"\s*:\s*"([^"]{4,})"/g;
const JSX_TEXT = />([^<>{}\n]{3,}?)</g;
/** A TEMPLATE literal — `Mise à jour ${v}` — is a sentence with a hole, and the hole is
 *  what hid it from the gate for months (`isCopy` rightly refuses a bare `${…}` as code).
 *  Counted when the TEXT around the holes reads as French: an accented letter, or one of
 *  the function words no identifier, class list or URL carries. Accent-blind for the rest
 *  is the JSX/prop rule's job; here the accent is the cheapest French detector there is. */
const TEMPLATE = /`([^`]{4,}?)`/g;
const FRENCH_WORDS =
  /(^|[\s«(])(le|la|les|des|une|un|du|au|aux|et|ou|est|sont|pour|avec|sur|dans|vos|votre|ce|cette|ces|pas|plus|ne|qui|que|prête|voir|nouveau|nouvelle|depuis|chez|encore|déjà)(?=[\s»,.:;!?)]|$)/i;
function isFrenchTemplate(v) {
  const s = v.replace(/\$\{[^}]*\}/g, " ").trim();
  if (!/[A-Za-zÀ-ÿ]{3,}/.test(s)) return false;
  if (!/ /.test(s)) return false; // one word is a class, an id, a key
  if (/[àâäéèêëîïôöùûüçœÀÂÉÈÊËÎÏÔÙÛÜÇŒ]/.test(s)) return true;
  return FRENCH_WORDS.test(s);
}

/** Is a value COPY (as opposed to an id, a URL, a CSS class)? */
function isCopy(v) {
  const s = v.trim();
  if (!/[A-Za-zÀ-ÿ]{3,}/.test(s)) return false;
  if (/^(https?:|\/|\.|#|\d)/.test(s)) return false;
  if (/^[a-z0-9_\-./]+$/.test(s)) return false; // id, path, class
  if (/^[A-Z0-9_]+$/.test(s)) return false; // CONSTANT
  if (/^[a-z][a-zA-Z]*$/.test(s)) return false; // identifier
  if (/className|=>|\bPromise\b|\bRecord</.test(s)) return false;
  if (s.includes("${")) return false; // un gabarit à trous est du CODE, pas une phrase
  // A LIST OF CLASSES ("intro-cell is-clear") or a list of technical tokens
  // (example domains, a path): every word in lowercase-hyphens.
  if (s.split(/\s+|\\n/).every((w) => !w || /^[a-z0-9][a-z0-9._/-]*$/.test(w))) return false;
  return true;
}

/** Zones EXCLUDED from the scope (see the header). */
const EXCLUDE = [
  /\.(test|spec)\.tsx?$/,
  /\/evals\//,
  /\/agent\//,
  /\/prompt\//,
  /^packages\/emails\/i18n\//,
  /^packages\/emails\/scripts\//,
  // The model REGISTRY: `label` there is a PROPER noun ("GPT-5.5", "Claude Opus"),
  // and its provider `desc` names brands — nothing to translate, everything would be noise.
  /^packages\/llm\/src\/models\//,
];

function coveredFiles() {
  const out = execSync(
    "git ls-files 'packages/ui/src/**/*.ts' 'packages/ui/src/**/*.tsx' " +
      "'packages/emails/**/*.ts' 'packages/emails/**/*.tsx' " +
      "'packages/catalog/src/**/*.ts' 'packages/llm/src/**/*.ts'",
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split("\n").filter((f) => f && !EXCLUDE.some((re) => re.test(f)));
}

/** A PROXY for "hard-coded French copy strings" in a file. Strips line and
 *  block comments, then counts accented literals + bare JSX text. */
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
    for (const m of line.matchAll(READ_PROPS)) if (isCopy(m[3])) n++;
    for (const m of line.matchAll(JSX_TEXT)) if (isCopy(m[1])) n++;
    for (const m of line.matchAll(TERNARY)) for (const g of [m[1], m[2]]) if (isCopy(g) && / /.test(g)) n++;
    for (const m of line.matchAll(TEMPLATE)) if (isFrenchTemplate(m[1])) n++;
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

// TOOTH 1 — a new file carrying French copy that isn't in the frozen list.
const fresh = withCopy.filter((f) => !(f in allow));
// TOOTH 2 — a frozen file that has grown past its count.
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
