#!/usr/bin/env node
// Les VALEURS de marque ont UNE maison : `packages/branding/branding.json`, consommé via
// `@openmasq/branding` (`BRAND`, `brandHost`, `brandKey`…) — toute valeur runtime/fil/disque
// (domaine, scheme de deep-link, clé de stockage, en-tête) en DÉRIVE, jamais un littéral.
// Le NOM, lui, sert aussi de namespace technique (scope npm, env `OPENMASQ_*`,
// `window.openmasq`) — il n'est plus interdit hors de ce paquet.
//
// Ce que ce garde interdit : le retour d'un nom RETIRÉ. Une occurrence est un résidu (un
// copier-coller d'une vieille branche, un import d'un vieux scope, une env d'un ancien
// nommage) qui casserait silencieusement — ni le scope npm, ni les variables
// d'environnement, ni `window.*` ne portent plus ces noms.
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

// Jamais écrits en clair : ce garde scanne aussi son propre fichier, et le motif en
// littéral serait sa seule « occurrence » — il s'échouerait lui-même. TROIS noms retirés :
// les deux noms de code du dépôt, et le nom de marque abandonné avant OpenMasq. Le dernier
// n'a AUCUNE exception : il n'a jamais atteint un disque d'utilisateur, donc rien ne doit
// le relire (à l'inverse des deux premiers, cf. `ALLOWED`).
const NEEDLES = [
  ["proxy", "chat"].join(""),
  ["kav", "iar"].join(""),
  ["openr", "edact"].join(""),
];

let out = "";
for (const needle of NEEDLES) {
  try {
    // Fichiers suivis par git seulement : node_modules, dist et artefacts locaux sont hors jeu.
    // -a : trois fixtures à octets de contrôle passent pour binaires et échapperaient à -I.
    out += execFileSync(
      "git",
      ["grep", "-a", "-i", "-n", "--full-name", needle, "--", ".", ":!pnpm-lock.yaml"],
      { encoding: "utf8" },
    );
  } catch (err) {
    // git grep sort en code 1 quand il ne trouve RIEN — c'est le succès ici.
    if (err.status === 1 && !err.stdout?.length) continue;
    if (err.stdout) out += err.stdout.toString();
    else throw err;
  }
}
if (!out.length) {
  console.log("check:brand — aucun résidu des noms retirés.");
  process.exit(0);
}

const offenders = out
  .split("\n")
  .filter(Boolean)
  .filter((line) => !ALLOWED.has(line.split(":", 1)[0]));

if (offenders.length) {
  console.error("Un nom retiré ne doit plus apparaître (voir NEEDLES) :");
  for (const line of offenders.slice(0, 50)) console.error("  " + line);
  if (offenders.length > 50) console.error(`  … et ${offenders.length - 50} autres lignes`);
  process.exit(1);
}
console.log("check:brand — aucun résidu des noms retirés (hors exceptions nommées).");
