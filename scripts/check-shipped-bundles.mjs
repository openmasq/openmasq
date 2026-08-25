#!/usr/bin/env node
// Ce qui part chez l'utilisateur ne doit pas EXPLIQUER le code qu'il contient.
//
// Rien de ce qui suit n'est de la protection : un `.crx` est un zip, un `.asar` est un tar,
// un bundle Capacitor est posé en clair dans l'IPA/APK. Tout ça se lit, et se relira
// toujours. Ce que cette porte interdit, c'est de LIVRER l'explication AVEC — la sourcemap
// qui rend le TypeScript d'origine verbatim, et les commentaires qui, dans ce dépôt,
// décrivent le modèle de menace et la garde qui le couvre. Les deux étaient expédiés :
// 16 `.map` avec `sourcesContent` dans l'extension publiée, et 806 commentaires intacts
// dans `apps/desktop/out/main/index.js`.
//
// Deux propriétés, vérifiées sur les artefacts CONSTRUITS (un réglage vite est une
// intention ; seul le fichier livrable est une preuve) :
//   1. aucune sourcemap, ni fichier `.map`, ni `sourceMappingURL` (y compris `data:`) ;
//   2. densité de commentaires quasi nulle = le bundle est bien minifié.
//
// Une cible non construite est SAUTÉE, pas une erreur : `pnpm verify` doit rester utile
// sans avoir tout empaqueté. C'est `.github/workflows/verify.yml` qui lance `pnpm build`
// avant, donc la CI voit les trois. `--require-all` force la présence des trois.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
// La MÊME table que celle qu'`afterPack.cjs` applique au build : une seconde liste ici
// dériverait de la première sans que rien ne le dise (règle 9).
const { findPackagingViolations, formatViolations } = require("../apps/desktop/scripts/packageContents.cjs");
const { listPackage } = require("@electron/asar");
const requireAll = process.argv.includes("--require-all");

/**
 * `maps` : tout le dossier livré — RIEN de légitime n'y expédie une sourcemap, pas même
 * une dépendance vendorée. `code` : nos bundles à nous, les seuls dont la minification
 * nous regarde (les prebuilts vendorés — onnxruntime, tesseract — arrivent tels quels et
 * portent leurs propres en-têtes de licence, qu'on ne réécrit pas).
 */
const TARGETS = [
  {
    name: "desktop",
    // ⚠️ Le desktop est l'EXCEPTION voulue : ses maps sont produites en `hidden`
    // (electron.vite.config.ts) comme artefacts d'UPLOAD Sentry (release.yml) — dans
    // `out/`, jamais dans l'app.
    //
    // ⛔ CE QUI NE SUFFIT PAS, et l'a prouvé : cette porte a longtemps vérifié que la
    // ligne `!out/**/*.map` FIGURAIT dans electron-builder.yml. Elle y figurait, la porte
    // était verte — et l'app expédiait quand même les 26 maps, plus `src/`, `e2e/` et les
    // `.env`, parce que l'allowlist entière avait cessé de s'appliquer (forme de
    // `mac.files` ; voir le commentaire de ce bloc dans electron-builder.yml). Grep dans
    // un fichier de config = vérifier une INTENTION, ce que ce fichier reproche par
    // ailleurs aux réglages vite.
    //
    // La garantie vit donc là où l'artefact existe : `apps/desktop/scripts/afterPack.cjs`
    // relit l'app.asar produit et casse l'empaquetage (mac ET Windows, tous les chemins,
    // avant signature). Ici on ne re-vérifie que si un `.app` traîne déjà sur le disque.
    maps: [],
    asarGuard: "apps/desktop/release",
    code: ["apps/desktop/out/main", "apps/desktop/out/preload", "apps/desktop/out/renderer/assets"],
    build: "cd apps/desktop && npx electron-vite build",
  },
];

/**
 * Le signal de minification est OCTETS PAR LIGNE, pas la densité de commentaires.
 * Compter les commentaires paraît plus direct et ne marche pas : esbuild PRÉSERVE les
 * en-têtes de licence en minifiant (`legalComments: "eof"` par défaut — 40 lignes de
 * `@license React` dans le gros chunk du renderer), et une feuille de style embarquée dans
 * un littéral gabarit ressemble ligne pour ligne à un commentaire. Les deux faisaient
 * échouer un bundle parfaitement minifié.
 *
 * Mesuré sur les artefacts de ce dépôt : minifié = 732 à 8 342 octets/ligne ; en clair,
 * ~50. Le seuil est donc large des deux côtés — il ne discrimine pas finement, il sépare
 * deux régimes qui n'ont rien à voir.
 */
const MIN_BYTES_PER_LINE = 200;
/** En dessous, la moyenne ne veut rien dire (un shim d'entrée fait 2 lignes). */
const MIN_BYTES = 50 * 1024;

function* jsFiles(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* jsFiles(p);
    else if (/\.(js|cjs|mjs)$/.test(name)) yield p;
  }
}

/** Les `app.asar` sous un dossier de release (mac-arm64/, mac/, win-unpacked/, …). */
function* asarFiles(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* asarFiles(p);
    else if (name === "app.asar") yield p;
  }
}

function* mapFiles(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* mapFiles(p);
    else if (name.endsWith(".map")) yield p;
  }
}

const problems = [];
const checked = [];
const skipped = [];

for (const t of TARGETS) {
  if (![...t.maps, ...t.code].some((d) => existsSync(join(root, d)))) {
    skipped.push(t);
    continue;
  }
  checked.push(t.name);

  // ── 0. L'exception desktop : relire l'APP, si elle a déjà été empaquetée ───
  if (t.asarGuard) {
    for (const asar of asarFiles(join(root, t.asarGuard))) {
      const violations = findPackagingViolations(listPackage(asar));
      // UN problème par asar, groupé : une fuite se compte en centaines d'entrées, et les
      // dérouler noierait le diagnostic dans son propre volume.
      if (violations.length > 0) {
        problems.push({
          target: t.name,
          msg: `${relative(root, asar)} — ${violations.length} entrée(s) interdite(s) :\n${formatViolations(violations)}`,
        });
      }
    }
  }

  // ── 1. Aucune sourcemap ────────────────────────────────────────────────────
  for (const dir of t.maps) {
    for (const file of mapFiles(join(root, dir))) {
      const rel = relative(root, file);
      let detail = "";
      try {
        const m = JSON.parse(readFileSync(file, "utf8"));
        if (Array.isArray(m.sourcesContent) && m.sourcesContent.some(Boolean)) {
          detail = ` — contient le SOURCE de ${m.sourcesContent.filter(Boolean).length} fichier(s)`;
        }
      } catch {
        /* une .map illisible reste une .map de trop */
      }
      problems.push({ target: t.name, msg: `sourcemap expédiée : ${rel}${detail}` });
    }
  }

  // ── 2. Aucune référence de sourcemap, et un bundle bien minifié ────────────
  for (const dir of t.code) {
    for (const file of jsFiles(join(root, dir))) {
      const text = readFileSync(file, "utf8");
      const rel = relative(root, file);

      if (text.includes("sourceMappingURL=data:")) {
        problems.push({ target: t.name, msg: `sourcemap INLINE (data:) dans ${rel}` });
      } else if (/[#@]\s*sourceMappingURL=/.test(text)) {
        problems.push({ target: t.name, msg: `référence de sourcemap dans ${rel}` });
      }

      if (text.length < MIN_BYTES) continue;
      const perLine = text.length / text.split("\n").length;
      if (perLine < MIN_BYTES_PER_LINE) {
        problems.push({
          target: t.name,
          msg:
            `${rel} n'est pas minifié — ${Math.round(perLine)} octets/ligne ` +
            `(plancher ${MIN_BYTES_PER_LINE})`,
        });
      }
    }
  }
}

if (requireAll && skipped.length) {
  for (const t of skipped) {
    problems.push({ target: t.name, msg: `pas construit (--require-all) — lancez : ${t.build}` });
  }
}

if (problems.length) {
  console.error(`\n✗ ${problems.length} problème(s) dans les bundles expédiés :\n`);
  for (const p of problems) console.error(`    [${p.target}] ${p.msg}`);
  console.error(
    "\n  Une sourcemap embarque `sourcesContent`, donc le TypeScript d'origine, commentaires\n" +
      "  compris. Le desktop produit les siennes en `hidden`, et c'est l'allowlist `files`\n" +
      "  d'electron-builder qui les tient hors de l'app — allowlist RELUE sur l'app.asar par\n" +
      "  apps/desktop/scripts/afterPack.cjs, pas seulement écrite dans un YAML. L'extension et\n" +
      "  le mobile n'en produisent aucune (leur livraison zippe le dossier entier).\n" +
      "  Un app.asar déjà sur le disque et fautif date d'avant le correctif : reconstruisez-le.\n",
  );
  process.exit(1);
}

const suffix = skipped.length ? ` (non construit, sauté : ${skipped.map((t) => t.name).join(", ")})` : "";
console.log(`✓ bundles expédiés sans sourcemap ni source lisible : ${checked.join(", ") || "aucun"}${suffix}`);
