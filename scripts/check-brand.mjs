#!/usr/bin/env node
// Les VALEURS de marque ont UNE maison : `packages/branding/branding.json`, consommé via
// `@openmasq/branding` (`BRAND`, `brandHost`, `brandKey`…) — toute valeur runtime/fil/disque
// (domaine, scheme de deep-link, clé de stockage, en-tête) en DÉRIVE, jamais un littéral.
// Le NOM, lui, sert aussi de namespace technique (scope npm, env `OPENMASQ_*`,
// `window.openmasq`) depuis la migration du 24/08/2026 — il n'est plus interdit hors de ce
// paquet.
//
// Ce que ce garde interdit désormais : le retour de l'ANCIEN nom de code du monorepo,
// retiré à cette même migration. Une occurrence est un résidu (un copier-coller d'une
// vieille branche, un import du vieux scope, une env de l'ancien nommage) qui casserait
// silencieusement — le scope npm et les variables d'environnement ne portent plus ce nom.
import { execFileSync } from "node:child_process";

// Les SEULES exceptions : la migration du parc. Une install d'avant le renommage porte
// ses données sous l'ancien nom (clés localStorage, fichier DB partagé pré-isolation),
// et le code qui les REPREND doit nommer ce qu'il cherche. Trois maisons, pas une de
// plus — un nouveau lecteur de l'ancien nom passe par `legacyStorage.ts`.
const ALLOWED = new Set([
  // La passe de migration localStorage (copie ancien préfixe → courant).
  "packages/ui/src/state/legacyStorage.ts",
  // Le script de thème pré-bundle : il court AVANT la migration, donc il replie seul.
  "apps/desktop/src/renderer/index.html",
  // L'adoption du DB partagé pré-isolation : le fichier du parc porte l'ancien nom.
  "apps/desktop/src/main/db/connection.ts",
]);

// Jamais écrit en clair : ce garde scanne aussi son propre fichier, et le motif en
// littéral serait sa seule « occurrence » — il s'échouerait lui-même.
const NEEDLE = ["proxy", "chat"].join("");

let out = "";
try {
  // Fichiers suivis par git seulement : node_modules, dist et artefacts locaux sont hors jeu.
  out = execFileSync(
    "git",
    ["grep", "-I", "-i", "-n", "--full-name", NEEDLE, "--", ".", ":!pnpm-lock.yaml"],
    { encoding: "utf8" },
  );
} catch (err) {
  // git grep sort en code 1 quand il ne trouve RIEN — c'est le succès ici.
  if (err.status === 1 && !err.stdout?.length) {
    console.log("check:brand — aucun résidu de l'ancien nom de code.");
    process.exit(0);
  }
  if (err.stdout) out = err.stdout.toString();
  else throw err;
}

const offenders = out
  .split("\n")
  .filter(Boolean)
  .filter((line) => !ALLOWED.has(line.split(":", 1)[0]));

if (offenders.length) {
  console.error("L'ancien nom de code ne doit plus apparaître (migration du 24/08/2026) :");
  for (const line of offenders.slice(0, 50)) console.error("  " + line);
  if (offenders.length > 50) console.error(`  … et ${offenders.length - 50} autres lignes`);
  process.exit(1);
}
console.log("check:brand — aucun résidu de l'ancien nom de code.");
