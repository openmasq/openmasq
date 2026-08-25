/**
 * Baker le runtime Python de CHAQUE arche que cette plateforme expédie.
 *
 * `bake-python-runtime.ts` fait UN triple (celui de l'hôte, ou `BAKE_TARGET`). Depuis que mac
 * livre deux arches, s'en tenir à l'hôte laisse `build/python-runtime/darwin-x64` vide —
 * `extraResources` le réclame pourtant à l'empaquetage. C'est la boucle qui manquait, et elle
 * vit ici plutôt que dans le workflow : `pnpm run release` sur une machine doit produire
 * exactement ce que la CI produit, sinon les deux chemins de release divergent (règle 9).
 *
 * Idempotent : un triple déjà baké est sauté sur sa signature, donc repasser ne coûte rien.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { currentBlock, shippedTriples } from "./shippedTriples";

const HERE = dirname(fileURLToPath(import.meta.url));
const triples = shippedTriples(currentBlock());
const passthrough = process.argv.slice(2); // `--force` notamment

// On relance le MÊME runtime que celui qui nous exécute (`execArgv` porte les drapeaux du
// chargeur TypeScript), plutôt que d'aller chercher le binaire `tsx` : pas de shim `.cmd` à
// contourner sur Windows, et aucune dépendance à un paquet que cette app ne déclare pas.
const relance = [...process.execArgv, join(HERE, "bake-python-runtime.ts"), ...passthrough];

console.log(`[bake:runtimes] ${triples.length} triple(s) à baker : ${triples.join(", ")}`);

for (const target of triples) {
  const r = spawnSync(process.execPath, relance, {
    stdio: "inherit",
    env: { ...process.env, BAKE_TARGET: target },
  });
  if (r.status !== 0) {
    // Pas de « on continue avec les autres » : un runtime manquant fait une app qui s'installe
    // et dont l'exécution Python ne marche pas. Mieux vaut l'arrêt ici que la découverte là-bas.
    console.error(`[bake:runtimes] échec sur ${target} → exit ${r.status}`);
    process.exit(r.status ?? 1);
  }
}
