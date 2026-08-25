// Ce que l'app EXPÉDIÉE a le droit de contenir — relu sur l'asar produit, pas sur la config.
//
// ⛔ POURQUOI CE FICHIER EXISTE. L'allowlist d'`electron-builder.cjs` (`files`) peut cesser
// de s'appliquer sans que rien ne rougisse : une liste de chaînes dans `mac.files` prend la
// place du matcher principal et electron-builder retombe sur `**/*`. L'app s'empaquette,
// démarre et se comporte normalement — elle est seulement plus large que ce que sa config
// décrit, et rien dans le build ne le dit. C'est la classe de défaut qu'un réglage ne peut
// pas garder, parce qu'un réglage est une INTENTION.
//
// La garde est donc ici, sur l'ARTEFACT, et elle échoue FERMÉ (règle 7) : une entrée hors
// allowlist casse l'empaquetage. Elle tourne dans `afterPack.cjs`, c'est-à-dire pour mac ET
// Windows, dans TOUS les chemins (`package`, `dist`, `release`, CI), et avant la signature.
//
// ⚠️ ALLOWLIST, jamais denylist. Interdire `src/` et `.env` nommément laisserait passer le
// prochain dossier qu'on ajoutera à `apps/desktop/`. On énumère ce qui est PERMIS.
"use strict";

/**
 * Les seules racines qu'un app.asar de l'app doit contenir.
 *
 * `out/` : les bundles (main, preload, renderer) produits par electron-vite.
 * `package.json` : lu par Electron au démarrage (nom, version, `main`).
 * `node_modules/` : les dépendances de production, filtrées par le matcher dédié
 *   d'electron-builder (ce sont ses `!…` qui y font le tri, pas cette table).
 */
const ALLOWED_ROOTS = ["out", "node_modules", "package.json"];

/**
 * Ce qui reste interdit À L'INTÉRIEUR d'une racine permise.
 *
 * Une `.map` de NOS bundles embarque `sourcesContent` : le TypeScript d'origine verbatim.
 * L'expédier annule la minification et livre l'explication avec le code — voir
 * `electron.vite.config.ts`. Les maps des dépendances vendorées ne sont pas concernées :
 * elles décrivent du code déjà public.
 */
const FORBIDDEN_WITHIN = [
  {
    test: (entry) => entry.startsWith("out/") && entry.endsWith(".map"),
    why: "sourcemap de nos bundles — elle contient le TypeScript d'origine (`sourcesContent`)",
  },
];

/** Le premier segment d'une entrée d'asar (`/out/main/index.js` → `out`). */
function rootOf(entry) {
  return entry.replace(/^\/+/, "").split("/")[0];
}

/**
 * Les entrées qui n'ont rien à faire dans l'app. Pur (aucun accès disque) pour être épinglé
 * par `packageContents.test.ts` : c'est la table qui décide, et une table fausse est
 * précisément ce qu'un build ne dit pas.
 *
 * @param {string[]} entries chemins listés dans l'asar (`/out/main/index.js`, `/.env`, …)
 * @returns {{entry: string, why: string}[]}
 */
function findPackagingViolations(entries) {
  const violations = [];
  for (const raw of entries) {
    const entry = raw.replace(/^\/+/, "");
    if (entry === "") continue;
    const root = rootOf(entry);
    if (!ALLOWED_ROOTS.includes(root)) {
      violations.push({ entry, why: `\`${root}\` n'est pas une racine permise` });
      continue;
    }
    const forbidden = FORBIDDEN_WITHIN.find((f) => f.test(entry));
    if (forbidden) violations.push({ entry, why: forbidden.why });
  }
  return violations;
}

/**
 * Le message d'échec : GROUPÉ par racine. Une fuite se compte en centaines d'entrées, et
 * neuf cents lignes dans un log de CI cachent le diagnostic au lieu de le donner.
 */
function formatViolations(violations) {
  const byWhy = new Map();
  for (const v of violations) {
    const bucket = byWhy.get(v.why) ?? [];
    bucket.push(v.entry);
    byWhy.set(v.why, bucket);
  }
  const lines = [];
  for (const [why, entries] of byWhy) {
    const sample = entries.slice(0, 3).join(", ");
    const rest = entries.length > 3 ? `, … (+${entries.length - 3})` : "";
    lines.push(`  • ${entries.length} entrée(s) — ${why}\n      ${sample}${rest}`);
  }
  return lines.join("\n");
}

/** ÉCHEC FERMÉ : casse l'empaquetage si l'app contient autre chose que son allowlist. */
function assertPackagedContents(entries) {
  const violations = findPackagingViolations(entries);
  if (violations.length === 0) return;
  throw new Error(
    `packageContents: ${violations.length} entrée(s) interdite(s) dans l'app.asar —\n` +
      `${formatViolations(violations)}\n\n` +
      `  L'allowlist \`files\` d'electron-builder.cjs ne s'applique plus. La cause connue :\n` +
      `  \`mac.files\`/\`win.files\` écrit en liste de CHAÎNES au lieu de la forme \`- filter:\`\n` +
      `  (le commentaire du bloc \`mac.files\` explique le mécanisme). Empaquetage interrompu :\n` +
      `  ces fichiers partiraient chez l'utilisateur.`,
  );
}

module.exports = { ALLOWED_ROOTS, findPackagingViolations, formatViolations, assertPackagedContents };
