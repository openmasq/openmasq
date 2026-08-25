// La porte ANTI-MINE du bundle main/preload — branchée sur `build`, donc aucun chemin
// vers un déploiement ne la contourne (CI, release, build local : même commande).
//
// La classe de bug qu'elle interdit : un PAIR OPTIONNEL non installé (le `canvas` de
// linkedom) que vite remplace par un module qui JETTE inconditionnellement —
// `__viteOptionalPeerDep_…` / « Could not resolve "x" imported by "y" » — hissé hors
// du try/catch d'origine. Le build RÉUSSIT, l'app meurt au chargement : invisible
// avant le premier lancement réel, c'est-à-dire après le déploiement. Ici, chaque
// mine trouvée est un échec de build, avec la décision à prendre (alias vers un stub,
// ou external) pointée dans le message.
//
// Périmètre : out/main + out/preload (chargés au boot ou au premier usage — une mine
// dans un chunk paresseux est une grenade dégoupillée, pas un moindre mal). Le
// renderer a son propre régime (CSP, imports web) et n'émet pas ce shim.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN = [join(root, "out", "main"), join(root, "out", "preload")];
// ⚠️ Le bundle est MINIFIÉ (`electron.vite.config.ts`, `shipped`), et la minification
// n'atteint pas les deux signatures de la même façon — mesuré : esbuild renomme
// `__viteOptionalPeerDep_…` en une lettre, donc cette signature-là est PERDUE sur un build
// expédié ; c'est le littéral de chaîne du `throw` qui porte la garde à lui seul (un
// minifieur ne réécrit pas le contenu d'une chaîne). Ne supprimez donc jamais la seconde
// en croyant que la première la couvre : c'est l'inverse. La première ne sert plus qu'en
// build non minifié.
const SIGNATURES = ["__viteOptionalPeerDep_", 'Could not resolve "'];

function* jsFiles(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* jsFiles(p);
    else if (name.endsWith(".js") || name.endsWith(".cjs") || name.endsWith(".mjs")) yield p;
  }
}

const hits = [];
for (const dir of SCAN) {
  for (const file of jsFiles(dir)) {
    const text = readFileSync(file, "utf8");
    for (const sig of SIGNATURES) {
      let i = text.indexOf(sig);
      while (i >= 0) {
        // La ligne fautive, bornée — assez pour nommer le pair et l'importeur.
        const line = text.slice(Math.max(0, text.lastIndexOf("\n", i) + 1), text.indexOf("\n", i)).slice(0, 160);
        hits.push({ file: file.slice(root.length + 1), line });
        i = text.indexOf(sig, i + sig.length);
      }
    }
  }
}

if (hits.length) {
  console.error(`\n✗ ${hits.length} mine(s) de pair optionnel dans le bundle — l'app jettera au chargement :`);
  for (const h of hits) console.error(`    ${h.file}\n      ${h.line}`);
  console.error(
    "\n  Un pair optionnel bundlé devient un throw inconditionnel (le try/catch d'origine est" +
      "\n  court-circuité). Décidez explicitement : alias vers un stub (voir `canvas` dans" +
      "\n  electron.vite.config.ts) ou external + packagé. Ne supprimez jamais cette porte.\n",
  );
  process.exit(1);
}
console.log("✓ bundle main/preload sans mine de pair optionnel");
