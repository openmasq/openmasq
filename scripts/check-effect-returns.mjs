// La porte ANTI-« destroy is not a function » — la classe de bug qu'elle interdit :
// un `useEffect(() => expr)` en ARROW CONCISE retourne `expr` comme fonction de
// nettoyage. Si `expr` se met un jour à retourner autre chose qu'une fonction, React
// l'appelle au démontage et TOUTE l'app tombe sur l'ErrorBoundary. Ce n'est pas
// théorique : Chromium a changé `scrollIntoView` pour retourner une PROMISE, et
// `useEffect(() => el.scrollIntoView(...))` — correct depuis des mois — a mis l'app à
// terre à chaque changement de modèle. `lib.dom` déclarant encore `void`, le typecheck
// ne PEUT PAS voir cette classe : la plateforme bouge sous les types.
//
// La règle : un effet s'écrit en CORPS DE BLOC, et ce qu'il retourne s'écrit `return …`
// — un retour EXPLICITE est un choix relu, un retour d'arrow concise est un accident
// qui attend son heure. Seule exception : `() => () => …` (cleanup pur, sans corps),
// dont le retour est une fonction par construction.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = [
  "packages/ui/src",
  "apps/desktop/src/renderer",
  "apps/web",
];
// `useEffect(() => X` où X n'est ni un bloc `{`, ni un cleanup pur `() =>`, ni un
// `void expr` (rejet explicite du retour — sûr par construction). Le `\S` final ancre
// la position : sans lui, `\s*` recule d'un cran et les lookaheads testent une espace.
const CONCISE = /use(?:Layout|Insertion)?Effect\(\s*\(\)\s*=>\s*(?!\{)(?!\(\)\s*=>)(?!void\b)\S/;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === "out" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|jsx|mjs)$/.test(name) && !/\.test\./.test(name)) yield p;
  }
}

const hits = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (CONCISE.test(line)) hits.push(`${file}:${i + 1}  ${line.trim().slice(0, 110)}`);
    });
  }
}

if (hits.length) {
  console.error(`\n✗ ${hits.length} effet(s) en arrow concise — le retour implicite devient le cleanup de React :`);
  for (const h of hits) console.error(`    ${h}`);
  console.error(
    "\n  Écrivez un CORPS DE BLOC : `useEffect(() => { expr; }, deps)` — et si un retour est voulu" +
      "\n  (unsubscribe, cleanup), écrivez `return …;` explicitement. La plateforme change ce que les" +
      "\n  API DOM retournent sous les types (`scrollIntoView` → Promise) : l'implicite finit sur" +
      "\n  l'ErrorBoundary. Ne supprimez jamais cette porte.\n",
  );
  process.exit(1);
}
console.log("✓ aucun effet en arrow concise (le cleanup de React est toujours un retour explicite)");
