/** Les types des COMPÉTENCES — avec la fonctionnalité (même règle que
 *  `memory/memoryTypes.ts`), ré-exportés par `types.ts`, l'unique surface d'import. */

/** The categories a Compétence can be filed under. The id is what persists, so
 *  it must stay stable; the label/tone/glyph are presentation. */
export type CompetenceCategoryId =
  | "redaction"
  | "analyse"
  | "code"
  | "juridique"
  | "support"
  /** Ce que l'app appelait un « workflow » : une compétence qui pilote des connecteurs. */
  | "routine";

/**
 * One COMPÉTENCE — a reusable prompt the user writes once and uses in a
 * conversation on demand ("utiliser" = stage it; its `prompt` joins the model
 * payload at send). User-authored content, NOT app config: see
 * `Settings.competences` for why it nonetheless rides the settings blob.
 *
 * ⚠️ **Il n'y a plus qu'UN objet.** Les « workflows » en étaient un second, au champ près,
 * avec deux écrans jumeaux. La seule différence de COMPORTEMENT était `servers`, devenu un
 * champ facultatif d'ici, et la règle qui remplace la frontière : **une compétence qui
 * nomme des connecteurs les utilise** (`competences/launch.ts`). Sans `servers`, rien ne
 * change de l'ancien comportement.
 */
export interface Competence {
  id: string;
  /** Short display name, e.g. "Réponse e-mail pro". */
  name: string;
  /** One-line description of what it does. */
  desc?: string;
  /** The prompt body that joins the model payload; `{accolades}` mark values to fill. */
  prompt: string;
  cat: CompetenceCategoryId;
  /** Catalog connector ids (`@openmasq/catalog` MCP registry) it drives. Absent or
   *  empty = a plain prompt, with no effect on which tools the turn is offered. */
  servers?: string[];
  /** Pinned → also listed in the sidebar for one-click use. */
  pinned?: boolean;
  /** How many times it has been used (ordering + a usage hint). */
  uses?: number;
  /** Creation time (ms epoch), for stable ordering. */
  createdAt: number;
}
