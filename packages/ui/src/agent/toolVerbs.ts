/**
 * **Comment se LIT le nom d'un outil** — côté UI.
 *
 * Le vocabulaire de verbes lui-même (READ/WRITE/DESTRUCTIVE/COMPOUND) et le classifieur
 * lecture-vs-écriture vivent dans `@openmasq/catalog/mcp` (`writeVocabulary.ts`), la
 * SEULE maison (règle 9) : le write-gate du process main (`apps/desktop` `writeGate.ts`)
 * juge sur la MÊME liste, et les deux copies avaient dérivé — verbes disjoints, défauts
 * opposés. Ici ne reste que ce qui est propre à l'UI : le retrait du nom de vendeur,
 * consommé par le seul préchargement (`isConfidentReadOnly`).
 */

export { READ_VERB, WRITE_VERB, DESTRUCTIVE_VERB, COMPOUND_WRITE } from "@openmasq/catalog/mcp";

/**
 * Le nom NU débarrassé du nom du VENDEUR quand il le répète — `notion__notion-fetch` →
 * `fetch`, `slack__slack_read_canvas` → `read_canvas`.
 *
 * Beaucoup de serveurs MCP préfixent chacun de leurs outils de leur propre nom, que le
 * client re-préfixe ensuite. `READ_VERB` étant ancré en TÊTE, le verbe se retrouvait
 * derrière un nom de marque et aucun outil Notion (10/10) ni Slack (9/9) ne passait pour
 * une lecture — donc ni préchargement parallèle, ni le rappel « émets-les ensemble »
 * (`batchReads`), qui lisent le MÊME prédicat.
 *
 * ⚠️ Ce n'est PAS un assouplissement, et il ne faut pas en faire un : l'invariant reste
 * « la TÊTE du nom est la commande », on retire seulement un espace de noms qui n'est pas
 * une commande. Le retrait ne sert qu'au test du verbe de lecture — les contrôles
 * destructif et composé, eux, portent toujours sur le nom COMPLET.
 */
export function bareWithoutVendor(name: string): string {
  const i = name.indexOf("__");
  if (i < 0) return name;
  const id = name.slice(0, i);
  const bare = name.slice(i + 2);
  // `-` et `_` sont interchangeables d'un serveur à l'autre (`notion-fetch` vs
  // `slack_read_file`), et un id vide ne doit pas tout emporter.
  if (!id) return bare;
  const re = new RegExp(`^${id.replace(/[^a-z0-9]/gi, "[-_]")}[-_]+`, "i");
  return bare.replace(re, "");
}
