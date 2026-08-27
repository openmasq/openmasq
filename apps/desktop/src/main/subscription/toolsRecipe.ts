/**
 * Le CONTRAT d'une recette de tour outillé — ce que chaque CLI doit fournir pour que le
 * squelette de `toolsTurn.ts` la serve : de quoi lancer le process, et de quoi ne rien
 * laisser derrière. Aucun code, seulement des types.
 *
 * Ce fichier existe pour n'avoir AUCUN cycle d'import : `toolsTurn.ts` importe les
 * recettes (valeurs), les recettes n'importent que d'ici. Un `import type` croisé
 * disparaît chez la plupart des outils mais pas chez tous — le graphe reste donc un
 * arbre, à la lettre.
 */
import type { CliProcessOptions } from "./spawnStream";
import type { ToolsBridge } from "./toolsBridge";

/** Ce qu'une recette reçoit pour composer le spawn de CE tour. */
export interface ToolsSpawnInput {
  /** Le pont déjà en écoute : son URL loopback et le jeton exigé sur chaque requête. */
  bridge: Pick<ToolsBridge, "url" | "token">;
  /** Les noms RÉELS des outils du tour — l'allow-list à donner à la CLI. */
  toolNames: string[];
  prompt: string;
  system?: string;
  modelId?: string;
}

/** Ce qu'une recette rend : de quoi lancer la CLI, et de quoi ne rien laisser derrière. */
export interface ToolsSpawnPlan {
  args: string[];
  /** Variables AJOUTÉES à l'environnement minimal de l'enfant (jamais un secret en argv). */
  extraEnv?: Record<string, string>;
  cleanup?: () => Promise<unknown>;
}

export interface ToolsCliRecipe {
  /** Le nom montré dans les refus (« Claude Code », « Codex »). */
  label: string;
  interpret: CliProcessOptions["interpret"];
  prepare: (input: ToolsSpawnInput) => Promise<ToolsSpawnPlan>;
}
