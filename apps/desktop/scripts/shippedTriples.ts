/**
 * QUELS TRIPLES CETTE PLATEFORME EXPÉDIE — lu dans `electron-builder.cjs`, qui est le seul
 * endroit où ça se décide.
 *
 * Pourquoi ça ne se recopie pas ailleurs (règle 9) : ce fait a TROIS lecteurs — le bake
 * (`bake-runtimes.ts` : un runtime Python par arche), la CI (`release.yml` : une archive R2
 * par arche) et l'empaquetage lui-même. Une liste recopiée dans un `package.json` ou un
 * workflow diverge au premier ajout d'arche, et la divergence ne se voit pas au build : elle
 * se voit à l'usage, sur la machine qui n'a pas reçu son interpréteur.
 *
 * La config est du CJS (elle dérive les identifiants de produit de
 * `packages/branding/branding.json`) : on la `require()` donc au lieu d'analyser du YAML à
 * la main. La contrepartie fail-closed est conservée — la fonction ÉCHOUE quand elle ne
 * reconnaît plus la forme de la config, au lieu de rendre une liste vide qui ferait
 * silencieusement sauter un bake.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const EB_CONFIG = join(HERE, "..", "electron-builder.cjs");

const require = createRequire(import.meta.url);

/** La part de la config qu'on lit ici : les cibles par bloc de plateforme. */
export interface EbPlatformTargets {
  target?: Array<{ target?: string; arch?: string[] }>;
}
export type EbConfigShape = Record<string, unknown> & {
  mac?: EbPlatformTargets;
  win?: EbPlatformTargets;
  linux?: EbPlatformTargets;
};

/** Le préfixe de triple que porte chaque bloc de plateforme d'`electron-builder.cjs`. */
const OS_OF_BLOCK: Record<string, string> = { mac: "darwin", win: "win32", linux: "linux" };

/**
 * Les triples expédiés par un bloc de plateforme (`mac` / `win`), dédoublonnés et ordonnés
 * comme la config les donne — `dmg` et `zip` répètent la même liste d'arches, c'est normal.
 */
export function shippedTriples(block: keyof typeof OS_OF_BLOCK | string, config?: EbConfigShape): string[] {
  const os = OS_OF_BLOCK[block];
  if (!os) throw new Error(`shippedTriples: bloc de plateforme inconnu : ${block}`);
  const source = config ?? (require(EB_CONFIG) as EbConfigShape);
  const platform = source[block] as EbPlatformTargets | undefined;
  if (!platform) throw new Error(`shippedTriples: aucun bloc \`${block}\` dans electron-builder.cjs`);
  const targets = Array.isArray(platform.target) ? platform.target : [];
  const arches = targets.flatMap((t) => (Array.isArray(t.arch) ? t.arch : []));
  if (arches.length === 0) {
    // Échec FERMÉ : « aucune arche » n'est jamais une vérité utile ici. Ça veut dire que la
    // forme de la config a changé — et un bake qui ne bake rien passerait pour un succès.
    throw new Error(
      `shippedTriples: aucune \`arch: [...]\` sous \`${block}\` — la forme d'electron-builder.cjs a changé`,
    );
  }
  return [...new Set(arches)].map((arch) => `${os}-${arch}`);
}

/** Le bloc de plateforme correspondant à la machine courante. */
export function currentBlock(platform: NodeJS.Platform = process.platform): string {
  const block = { darwin: "mac", win32: "win", linux: "linux" }[platform as string];
  if (!block) throw new Error(`shippedTriples: plateforme non empaquetée : ${platform}`);
  return block;
}
